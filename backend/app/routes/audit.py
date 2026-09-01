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
                    diagnosis_term=%s, diagnosis_code=%s, encounter_type=%s
                WHERE id=%s
            '''
            cursor.execute(update_query, (
                data.patient.patient_name, data.patient.department, data.patient.age, 
                data.patient.age_unit, data.patient.gender, data.patient.diagnosis_term, 
                data.patient.diagnosis_code, data.patient.encounter_type, patient_id
            ))
        else:
            patient_query = '''
                INSERT INTO patients (
                    uhid, patient_name, department, date_of_admission, 
                    age, age_unit, gender, consultant_name, diagnosis_term, diagnosis_code,
                    is_transcribed, treatment_chart_url, encounter_type
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            '''
            cursor.execute(patient_query, (
                data.patient.uhid, data.patient.patient_name, data.patient.department, 
                data.patient.date_of_admission, data.patient.age, data.patient.age_unit,
                data.patient.gender, data.patient.consultant_name, data.patient.diagnosis_term, 
                data.patient.diagnosis_code, data.patient.is_transcribed, data.patient.treatment_chart_url, data.patient.encounter_type
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
