from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from enum import Enum

class SeverityEnum(str, Enum):
    A = 'A'; B = 'B'; C = 'C'; D = 'D'; E = 'E'; F = 'F'; G = 'G'; H = 'H'; I = 'I'

class PatientBase(BaseModel):
    uhid: str
    patient_name: Optional[str] = None
    department: Optional[str] = None
    date_of_admission: Optional[date] = None
    age: Optional[int] = None
    age_unit: Optional[str] = 'Years'
    gender: Optional[str] = None
    consultant_name: Optional[str] = None
    diagnosis_term: Optional[str] = None
    diagnosis_code: Optional[str] = None
    is_transcribed: Optional[bool] = None
    treatment_chart_url: Optional[str] = None
    encounter_type: Optional[str] = 'IPD'

class PatientCreate(PatientBase): pass

class ErrorBase(BaseModel):
    error_category: str
    sub_category: str
    severity: SeverityEnum
    remarks: Optional[str] = None
    evidence_image_url: Optional[str] = None

class ErrorCreate(ErrorBase): pass

class DrugBase(BaseModel):
    drug_term: str
    drug_code: Optional[str] = None
    dose: Optional[str] = None
    route: Optional[str] = None
    frequency: Optional[str] = None

class DrugCreate(DrugBase):
    errors: Optional[List[ErrorCreate]] = []

class AuditSubmission(BaseModel):
    patient: PatientCreate
    drugs: List[DrugCreate] = []
