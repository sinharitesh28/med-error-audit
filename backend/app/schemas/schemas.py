from pydantic import BaseModel
from typing import List, Optional

class Patient(BaseModel):
    uhid: str
    patient_name: Optional[str] = None
    department: str
    date_of_admission: Optional[str] = None
    age: Optional[int] = None
    age_unit: Optional[str] = None
    gender: Optional[str] = None
    consultant_name: Optional[str] = None
    diagnosis_term: Optional[str] = None
    diagnosis_code: Optional[str] = None
    is_transcribed: Optional[str] = None
    treatment_chart_url: Optional[str] = None
    encounter_type: Optional[str] = 'IPD'

class ErrorDetail(BaseModel):
    error_category: str
    sub_category: str
    severity: str
    remarks: Optional[str] = None
    evidence_image_url: Optional[str] = None

class Drug(BaseModel):
    drug_term: str
    drug_code: Optional[str] = None
    dose: Optional[str] = None
    route: Optional[str] = None
    frequency: Optional[str] = None
    errors: List[ErrorDetail] = []

class AuditSubmission(BaseModel):
    patient: Patient
    drugs: List[Drug]
    session_token: Optional[str] = None
