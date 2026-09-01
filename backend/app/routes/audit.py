from fastapi import APIRouter, HTTPException
from typing import List
from schemas.schemas import AuditSubmission
from database import get_db_connection
import pymysql

router = APIRouter(prefix="/api/audit", tags=["Audit"])

@router.get("/search-atc")
def search_atc(q: str):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        like_q = f"%{q}%"
        cursor.execute('''
            SELECT atc_code, atc_name, ddd, uom, adm_r 
            FROM atc_drugs 
            WHERE atc_name LIKE %s OR atc_code LIKE %s 
            LIMIT 50
        ''', (like_q, like_q))

        results = cursor.fetchall()

        # Group by ATC Code to combine available doses and routes
        grouped = {}
        for r in results:
            code = r['atc_code']
            if code not in grouped:
                grouped[code] = {
                    "atc_code": code,
                    "atc_name": r['atc_name'],
                    "doses": set(),
                    "routes": set()
                }

            # Combine DDD and Unit of Measure (UOM), ignoring 'NA'
            if r['ddd'] and r['uom'] and str(r['ddd']).strip().upper() != 'NA' and str(r['uom']).strip().upper() != 'NA':
                grouped[code]["doses"].add(f"{r['ddd']} {r['uom']}")

            # Capture Administration Route, ignoring 'NA'
            if r['adm_r'] and str(r['adm_r']).strip().upper() != 'NA':
                grouped[code]["routes"].add(r['adm_r'])

        # Format for JSON response
        for v in grouped.values():
            v["doses"] = list(v["doses"])
            v["routes"] = list(v["routes"])

        return {"status": "success", "data": list(grouped.values())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/submit")
def submit_audit(data: AuditSubmission):
    conn = get_db_connection()
    conn.autocommit(False)

    try:
        cursor = conn.cursor()

        # Check if patient already exists by UHID
        cursor.execute("SELECT id FROM patients WHERE uhid = %s", (data.patient.uhid,))
        existing_patient = cursor.fetchone()

        if existing_patient:
            patient_id = existing_patient['id']
            update_query = '''
                UPDATE patients 
                SET patient_name=%s, department=%s, age=%s, age_unit=%s, gender=%s, 
                    diagnosis_term=%s, diagnosis_code=%s, encounter_type=%s, auditor_name=%s
                WHERE id=%s
            '''
            cursor.execute(update_query, (
                data.patient.patient_name, data.patient.department, data.patient.age, 
                data.patient.age_unit, data.patient.gender, data.patient.diagnosis_term, 
                data.patient.diagnosis_code, data.patient.encounter_type, auditor_name, patient_id
            ))
        else:
            patient_query = '''
                INSERT INTO patients (
                    uhid, patient_name, department, date_of_admission, 
                    age, age_unit, gender, consultant_name, diagnosis_term, diagnosis_code,
                    is_transcribed, treatment_chart_url, encounter_type, auditor_name
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            '''
            cursor.execute(patient_query, (
                data.patient.uhid, data.patient.patient_name, data.patient.department, 
                data.patient.date_of_admission, data.patient.age, data.patient.age_unit,
                data.patient.gender, data.patient.consultant_name, data.patient.diagnosis_term, 
                data.patient.diagnosis_code, data.patient.is_transcribed, data.patient.treatment_chart_url, data.patient.encounter_type, auditor_name
            ))
            patient_id = cursor.lastrowid

        for drug in data.drugs:
            drug_query = '''
                INSERT INTO drugs (patient_id, drug_term, drug_code, dose, route, frequency)
                VALUES (%s, %s, %s, %s, %s, %s)
            '''
            cursor.execute(drug_query, (
                patient_id, drug.drug_term, drug.drug_code, drug.dose, drug.route, drug.frequency
            ))
            drug_id = cursor.lastrowid

            if drug.errors:
                for error in drug.errors:
                    error_query = '''
                        INSERT INTO medication_errors (
                            drug_id, error_category, sub_category, severity, remarks, evidence_image_url
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                    '''
                    cursor.execute(error_query, (
                        drug_id, error.error_category, error.sub_category,
                        error.severity.value, error.remarks, error.evidence_image_url
                    ))

        conn.commit()
        return {"status": "success", "message": "Audit submitted successfully", "patient_id": patient_id}

    except pymysql.MySQLError as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
    finally:
        conn.close()

@router.get("/datasheet")
def get_datasheet():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        # Fetch everything joined
        query = '''
            SELECT 
                p.id as p_id, p.encounter_type, p.patient_name, p.department, p.uhid, 
                p.date_of_admission, p.age, p.age_unit, p.gender, p.consultant_name, 
                p.diagnosis_term, p.is_transcribed, p.treatment_chart_url, p.auditor_name, p.created_at,
                d.id as d_id, d.drug_term, d.dose, d.route, d.frequency,
                e.error_category, e.sub_category, e.severity, e.remarks, e.evidence_image_url
            FROM patients p
            JOIN drugs d ON p.id = d.patient_id
            LEFT JOIN medication_errors e ON d.id = e.drug_id
        '''
        cursor.execute(query)
        raw_data = cursor.fetchall()

        # Group by Drug (Each drug is ONE row in the datasheet)
        drugs_map = {}
        for row in raw_data:
            did = row['d_id']
            if did not in drugs_map:
                drugs_map[did] = {
                    "patient": row,
                    "drug": row,
                    "errors": {}
                }
            if row['error_category'] and row['sub_category']:
                drugs_map[did]["errors"][(row['error_category'], row['sub_category'])] = {
                    "severity": row['severity'],
                    "remarks": row['remarks'],
                    "image": row['evidence_image_url']
                }

        # The NA Matrix Calculator
        def get_status(p, d, errs, cat, sub):
            # 1. If reported, return severity (A-I)
            if (cat, sub) in errs: return errs[(cat, sub)]['severity']

            # 2. OPD Exclusions
            if p.get('encounter_type') == 'OPD' and cat not in ['Prescription Error', 'Dispensing Error']:
                return 'NA'

            # 3. Transcription Exclusions
            if cat == 'Transcription Error' and p.get('is_transcribed') == 'No':
                return 'NA'

            # 4. IV/Route Exclusions
            iv_errors = ['Intravenous incompatibility', 'Inappropriate dilutions/infusions', 'No/Wrong Rate of administration', 'Wrong Rate', 'Wrong rate']
            route = str(d.get('route', '')).lower()
            is_iv = 'iv' in route or 'intravenous' in route or 'infusion' in route
            if sub in iv_errors and not is_iv:
                return 'NA'

            # 5. Default No Error
            return '0'

        # Build Flat Rows
        datasheet = []
        for did, data in drugs_map.items():
            p = data['patient']
            d = data['drug']
            e = data['errors']

            # Helper to get remarks/images safely
            def get_meta(cat, field):
                # Joins remarks from multiple subcategories in the same category
                meta = [v[field] for k, v in e.items() if k[0] == cat and v[field]]
                return " | ".join(meta) if meta else ""

            row = {
                "Audit TimeStamp": str(p.get('created_at', '')),
                "Auditor Name": p.get('auditor_name', 'Unknown'),
                "Encounter": p.get('encounter_type'),
                "Patient Name": p.get('patient_name'),
                "Department": p.get('department'),
                "UHID": p.get('uhid'),
                "Admission Date": str(p.get('date_of_admission') or ''),
                "Age/Gender": f"{p.get('age')} {p.get('age_unit')} / {p.get('gender')}",
                "Consultant": p.get('consultant_name'),
                "Diagnosis": p.get('diagnosis_term'),
                "Transcribed?": p.get('is_transcribed'),
                "Chart Image": p.get('treatment_chart_url'),

                "Drug Name": d.get('drug_term'),
                "Dose": d.get('dose'),
                "Route": d.get('route'),
                "Frequency": d.get('frequency'),

                # Prescription
                "Rx: Inappropriate selection": get_status(p, d, e, 'Prescription Error', 'Inappropriate selection'),
                "Rx: CAPITAL LETTERS": get_status(p, d, e, 'Prescription Error', 'Drug orders in CAPITAL LETTERS'),
                "Rx: Illegible": get_status(p, d, e, 'Prescription Error', 'Illegible handwriting'),
                "Rx: Abbreviations": get_status(p, d, e, 'Prescription Error', 'Error prone abbreviations'),
                "Rx: Generic name": get_status(p, d, e, 'Prescription Error', 'Generic name written'),
                "Rx: Wrong Dose": get_status(p, d, e, 'Prescription Error', 'No/Wrong Dose'),
                "Rx: Wrong Route": get_status(p, d, e, 'Prescription Error', 'No/Wrong Route'),
                "Rx: IV Incompat.": get_status(p, d, e, 'Prescription Error', 'Intravenous incompatibility'),
                "Rx Remarks": get_meta('Prescription Error', 'remarks'),
                "Rx Evidence": get_meta('Prescription Error', 'image'),

                # Transcription
                "Tx: Wrong drug": get_status(p, d, e, 'Transcription Error', 'Wrong drug'),
                "Tx: Wrong route": get_status(p, d, e, 'Transcription Error', 'Wrong Route'),
                "Tx Remarks": get_meta('Transcription Error', 'remarks'),
                "Tx Evidence": get_meta('Transcription Error', 'image'),

                # Dispensing
                "Disp: Wrong drug": get_status(p, d, e, 'Dispensing Error', 'Wrong drug'),
                "Disp: Expired": get_status(p, d, e, 'Dispensing Error', 'Expired/Near expiry drugs'),
                "Disp Remarks": get_meta('Dispensing Error', 'remarks'),
                "Disp Evidence": get_meta('Dispensing Error', 'image'),

                # Admin
                "Admin: Omission": get_status(p, d, e, 'Administration Error', 'Dose Omission'),
                "Admin: Wrong patient": get_status(p, d, e, 'Administration Error', 'Wrong patient'),
                "Admin Remarks": get_meta('Administration Error', 'remarks'),
                "Admin Evidence": get_meta('Administration Error', 'image'),
            }
            datasheet.append(row)

        return {"status": "success", "data": datasheet}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
