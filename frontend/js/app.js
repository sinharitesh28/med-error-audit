
let drugCount = 0;
let selectedDiagnoses = []; 

const errorSubcategories = {
    "Prescription Error": ["Inappropriate selection", "Drug orders in CAPITAL LETTERS", "Illegible handwriting", "Error prone abbreviations", "Generic name written", "No/Wrong Dose", "No/Wrong Unit", "No/Wrong Frequency", "No/Wrong Route", "No/Wrong Concentration", "No/Wrong Rate of administration", "Non-modification (drug-drug)", "Non-modification (food-drug)", "Non-modification (hepatic/renal)", "Intravenous incompatibility", "Inappropriate dilutions/infusions"],
    "Transcription Error": ["Wrong formulation", "Wrong drug", "Wrong strength", "Wrong Unit", "Wrong Frequency", "Wrong Route", "Wrong Concentration", "Wrong Rate"],
    "Indenting Error": ["Wrong formulation", "Wrong drug", "Wrong strength", "Wrong Unit"],
    "Dispensing Error": ["Wrong drug", "Wrong strength", "Wrong formulation", "Expired/Near expiry drugs", "No/Wrong Labelling", "Delay in dispense > defined time", "Generic/class substitute without consultation"],
    "Administration Error": ["Wrong patient", "Wrong drug", "Dose Omission", "Improper dose", "Wrong formulation", "Wrong route", "Wrong rate", "Wrong duration", "Wrong time", "Intravenous incompatibility", "Inappropriate dilutions/infusions"],
    "Documentation Error": ["No documentation of administration", "Incomplete/Improper documentation", "Documentation without administration"]
};

function initDiagnosisAutocomplete() {
    const inputEl = document.getElementById('diagnosis-display');
    const dropdownEl = document.getElementById('diagnosis-results');
    let debounceTimer;

    inputEl.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        if (query.length < 2) { dropdownEl.style.display = 'none'; return; }

        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms=${encodeURIComponent(query)}&df=primary_name,icd10cm_codes`);
                const data = await res.json();
                dropdownEl.innerHTML = '';
                if (!data[3] || data[3].length === 0) { dropdownEl.style.display = 'none'; return; }

                data[3].forEach((item) => {
                    const termName = item[0];
                    const codeValue = item[1] || 'Uncoded';
                    const li = document.createElement('li');
                    li.textContent = `${termName} [${codeValue}]`;
                    li.onclick = () => {
                        if(!selectedDiagnoses.find(d => d.code === codeValue)) {
                            selectedDiagnoses.push({term: termName, code: codeValue});
                            renderDiagnosisPills();
                        }
                        inputEl.value = '';
                        dropdownEl.style.display = 'none';
                    };
                    dropdownEl.appendChild(li);
                });
                dropdownEl.style.display = 'block';
            } catch (err) { console.error(err); }
        }, 300);
    });
}

function renderDiagnosisPills() {
    const container = document.getElementById('diagnosis-pills');
    container.innerHTML = '';
    selectedDiagnoses.forEach((diag, idx) => {
        container.innerHTML += `<div class="diagnosis-pill">${diag.term} [${diag.code}] 
            <span onclick="removeDiagnosis(${idx})" style="display:flex; align-items:center; cursor:pointer;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </span></div>`;
    });
}

function removeDiagnosis(idx) { selectedDiagnoses.splice(idx, 1); renderDiagnosisPills(); }

function updateSubcategories(selectEl, targetId) {
    const category = selectEl.value;
    const subSelect = document.getElementById(targetId);
    subSelect.innerHTML = '<option value="">Select Specific Error</option>';
    if (category && errorSubcategories[category]) {
        errorSubcategories[category].forEach(sub => { subSelect.innerHTML += `<option value="${sub}">${sub}</option>`; });
    }
}

// --- NEW DYNAMIC NUMBERING & REMOVAL LOGIC ---
function removeDrug(btn) {
    btn.closest('.drug-entry').remove();
    updateDrugNumbering();
}

function updateDrugNumbering() {
    const drugCards = document.querySelectorAll('.drug-entry');
    drugCards.forEach((card, index) => {
        const title = card.querySelector('.drug-title');
        if (title) title.textContent = `Drug Details #${index + 1}`;
    });
}

function removeError(btn) {
    btn.closest('.error-entry').remove();
}

// --- NEW WHO ATC AUTOCOMPLETE API FETCH ---
function attachDrugAutocomplete(drugId) {
    const inputEl = document.getElementById(`drug-display-${drugId}`);
    const dropdownEl = document.getElementById(`drug-results-${drugId}`);
    const codeEl = document.getElementById(`drug-code-${drugId}`);
    const doseListEl = document.getElementById(`drug-dose-list-${drugId}`);
    const routeListEl = document.getElementById(`drug-route-list-${drugId}`);
    let debounceTimer;

    inputEl.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        if (query.length < 2) { dropdownEl.style.display = 'none'; return; }

        debounceTimer = setTimeout(async () => {
            try {
                // Queries our local FastAPI ATC endpoint instead of NLM
                const res = await fetch(`/api/audit/search-atc?q=${encodeURIComponent(query)}`);
                const json = await res.json();
                const data = json.data || [];

                dropdownEl.innerHTML = '';
                if (data.length === 0) { dropdownEl.style.display = 'none'; return; }

                data.forEach((item) => {
                    const li = document.createElement('li');
                    li.textContent = `${item.atc_name} [ATC: ${item.atc_code}]`;
                    li.onclick = () => {
                        inputEl.value = item.atc_name;
                        codeEl.value = item.atc_code;

                        // Populate DDD & UOM into Dose Datalist
                        doseListEl.innerHTML = '';
                        item.doses.forEach(dose => {
                            doseListEl.innerHTML += `<option value="${dose}">`;
                        });

                        // Populate adm_r into Route Datalist + Global Standard Routes
                        routeListEl.innerHTML = '';
                        const standardRoutes = ['Oral (PO)', 'Intravenous (IV)', 'Intramuscular (IM)', 'Subcutaneous (SC)', 'Sublingual (SL)', 'Topical', 'Inhalation', 'Ophthalmic', 'Otic', 'Rectal', 'Vaginal', 'Nasal'];
                        const allRoutes = new Set([...item.routes, ...standardRoutes]);

                        allRoutes.forEach(route => {
                            if(route && route.toUpperCase() !== 'NA') {
                                routeListEl.innerHTML += `<option value="${route}">`;
                            }
                        });

                        dropdownEl.style.display = 'none';
                    };
                    dropdownEl.appendChild(li);
                });
                dropdownEl.style.display = 'block';
            } catch (err) { console.error(err); }
        }, 300);
    });
}

function addDrug() {
    drugCount++;
    const container = document.getElementById('drugs-container');
    const drugHtml = `
        <div class="card drug-entry" data-drug-id="${drugCount}">
            <button type="button" class="btn-remove" onclick="removeDrug(this)" title="Remove Drug">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            <h3 class="drug-title">Drug Details</h3>

            <div class="clinical-field-wrapper form-group">
                <label>Drug Name (WHO ATC Search) *</label>
                <input type="text" class="d-display" id="drug-display-${drugCount}" autocomplete="off" placeholder="Type drug name or ATC code..." required>
                <input type="hidden" class="d-code" id="drug-code-${drugCount}">
                <ul id="drug-results-${drugCount}" class="autocomplete-dropdown" style="display:none;"></ul>
            </div>

            <div style="display:flex; gap:10px;">
                <div class="form-group" style="flex:1;">
                    <label>Dose (Search or Type)</label>
                    <input type="text" class="d-dose" list="drug-dose-list-${drugCount}" placeholder="Select or type...">
                    <datalist id="drug-dose-list-${drugCount}"></datalist>
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Route (Search or Type) *</label>
                    <input type="text" class="d-route" list="drug-route-list-${drugCount}" placeholder="Select or type..." required>
                    <datalist id="drug-route-list-${drugCount}"></datalist>
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Frequency</label>
                    <select class="d-frequency">
                        <option value="">Select Frequency</option>
                        <option value="1-0-0 (Morning)">1-0-0 (Morning)</option>
                        <option value="0-1-0 (Afternoon)">0-1-0 (Afternoon)</option>
                        <option value="0-0-1 (Night)">0-0-1 (Night)</option>
                        <option value="1-0-1 (BD)">1-0-1 (BD)</option>
                        <option value="1-1-1 (TDS)">1-1-1 (TDS)</option>
                        <option value="1-1-1-1 (QID)">1-1-1-1 (QID)</option>
                        <option value="SOS (As needed)">SOS (As needed)</option>
                        <option value="STAT (Immediately)">STAT (Immediately)</option>
                    </select>
                </div>
            </div>

            <div id="errors-container-${drugCount}"></div>
            <button type="button" class="btn btn-danger" onclick="addError(${drugCount})">+ Add Medication Error</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', drugHtml);
    attachDrugAutocomplete(drugCount);
    updateDrugNumbering(); // Apply dynamic numbering immediately
}

function addError(drugId) {
    const container = document.getElementById(`errors-container-${drugId}`);
    const errorCount = container.children.length + 1;
    const subCatId = `e-subcategory-d${drugId}-e${errorCount}`;

    const severityConfigs = [
        {val: 'A', color: 'sev-a', text: 'Capacity to cause error'},
        {val: 'B', color: 'sev-b', text: 'Error occurred, did not reach patient'},
        {val: 'C', color: 'sev-c', text: 'Reached patient, no harm'},
        {val: 'D', color: 'sev-d', text: 'Reached patient, required monitoring'},
        {val: 'E', color: 'sev-e', text: 'Harm, temporary damage'},
        {val: 'F', color: 'sev-f', text: 'Harm, initial hospitalization/prolonged'},
        {val: 'G', color: 'sev-g', text: 'Permanent patient harm'},
        {val: 'H', color: 'sev-h', text: 'Near death event'},
        {val: 'I', color: 'sev-i', text: 'Patient death'}
    ];

    let severityHtml = severityConfigs.map(s => 
        `<label class="severity-item">
            <input type="radio" name="sev-d${drugId}-e${errorCount}" value="${s.val}" required> 
            <span class="sev-svg ${s.color}"></span> 
            <span class="sev-text"><b>${s.val}:</b> ${s.text}</span>
         </label>`
    ).join('');

    const errorHtml = `
        <div class="error-card error-entry">
            <button type="button" class="btn-remove" onclick="removeError(this)" title="Remove Error">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            <h4>Error Report</h4>
            <div class="form-group">
                <label>Error Category *</label>
                <select class="e-category" onchange="updateSubcategories(this, '${subCatId}')" required>
                    <option value="">Select Category</option>
                    <option value="Prescription Error">Prescription Error</option>
                    <option value="Transcription Error">Transcription Error</option>
                    <option value="Indenting Error">Indenting Error</option>
                    <option value="Dispensing Error">Dispensing Error</option>
                    <option value="Administration Error">Administration Error</option>
                    <option value="Documentation Error">Documentation Error</option>
                </select>
            </div>
            <div class="form-group">
                <label>Sub Category / Specific Error *</label>
                <select id="${subCatId}" class="e-subcategory" required></select>
            </div>
            <div class="form-group">
                <label>Severity (NCC MERP Index) *</label>
                <div class="severity-options">${severityHtml}</div>
            </div>
            <div class="form-group">
                <label>Remarks *</label>
                <textarea class="e-remarks" rows="2" required placeholder="Describe the error scenario..."></textarea>
            </div>
            <div class="form-group">
                <label>Evidence Image (Will upload to Google Drive) *</label>
                <input type="file" class="e-image-file" accept="image/*" required>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', errorHtml);
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]); 
    reader.onerror = error => reject(error);
});

const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxXswWXgxo2IBIZPYBfVhcmLKZqL52NMlKPMBBLbpPyMHEDHmATIWTcXaOy9LY5p86yTA/exec";

async function uploadToDrive(file, category) {
    if(!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL === "YOUR_APP_SCRIPT_URL_HERE") return null;

    const base64Data = await toBase64(file);
    const payload = { fileName: file.name, mimeType: file.type, data: base64Data, folderName: category };

    try {
        const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        return (result.status === 'success') ? result.url : null;
    } catch (err) {
        console.error("Upload Error:", err);
        return null;
    }
}

async function submitForm(e) {
    e.preventDefault();

    const submitBtn = document.querySelector('.btn-submit');
    if (submitBtn.disabled) return; 

    submitBtn.disabled = true;
    submitBtn.style.backgroundColor = '#999';
    submitBtn.textContent = 'Uploading Evidence & Submitting... Please Wait';

    const combinedTerms = selectedDiagnoses.map(d => d.term).join(", ");
    const combinedCodes = selectedDiagnoses.map(d => d.code).join(", ");

    const patient = {
        uhid: document.getElementById('p-uhid').value,
        patient_name: document.getElementById('p-name').value,
        department: document.getElementById('p-dept').value,
        age: parseInt(document.getElementById('p-age').value) || null,
        age_unit: document.getElementById('p-age-unit').value,
        gender: document.getElementById('p-gender').value,
        diagnosis_term: combinedTerms,
        diagnosis_code: combinedCodes,
        is_transcribed: document.getElementById('p-transcribed').value
    };
    
    const chartFile = document.getElementById('p-chart-file').files[0];
    if(chartFile) {
        submitBtn.textContent = 'Uploading Patient Chart...';
        patient.treatment_chart_url = await uploadToDrive(chartFile, 'PatientCharts');
    }

    const drugs = [];
    document.querySelectorAll('.drug-entry').forEach(async (drugEl) => {
        const drug = {
            drug_term: drugEl.querySelector('.d-display').value,
            drug_code: drugEl.querySelector('.d-code').value || null,
            dose: drugEl.querySelector('.d-dose').value,
            route: drugEl.querySelector('.d-route').value,
            frequency: drugEl.querySelector('.d-frequency').value,
            errors: []
        };

        for (const errorEl of drugEl.querySelectorAll('.error-entry')) {
            const category = errorEl.querySelector('.e-category').value;
            const severityInput = errorEl.querySelector('input[type="radio"]:checked');

            const fileInput = errorEl.querySelector('.e-image-file');
            let driveUrl = null;
            if(fileInput.files.length > 0) {
                fileInput.parentElement.insertAdjacentHTML('beforeend', '<span class="uploading-txt" style="color:var(--secondary); font-weight:bold; display:block; margin-top:5px;">Uploading to Drive...</span>');
                driveUrl = await uploadToDrive(fileInput.files[0], category);
                const upTxt = errorEl.querySelector('.uploading-txt');
                if(upTxt) upTxt.remove();
            }

            drug.errors.push({
                error_category: category,
                sub_category: errorEl.querySelector('.e-subcategory').value,
                severity: severityInput ? severityInput.value : 'A',
                remarks: errorEl.querySelector('.e-remarks').value,
                evidence_image_url: driveUrl
            });
        }
        drugs.push(drug);
    });

    setTimeout(async () => {
        try {
            const response = await fetch('/api/audit/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patient, drugs })
            });

            const result = await response.json();
            if(response.ok) {
                alert('Audit submitted successfully! Linked to Patient ID: ' + result.patient_id);
                document.getElementById('auditForm').reset();
                document.getElementById('drugs-container').innerHTML = '';
                document.getElementById('diagnosis-pills').innerHTML = '';
                selectedDiagnoses = [];
                drugCount = 0;
                addDrug(); 
            } else alert('Backend Error: ' + JSON.stringify(result));
        } catch (err) { 
            alert('Backend connection failed.'); 
        } finally {
            submitBtn.disabled = false;
            submitBtn.style.backgroundColor = '';
            submitBtn.textContent = 'Submit Audit Form';
        }
    }, 1000); 
}

document.addEventListener("DOMContentLoaded", () => {
    initDiagnosisAutocomplete();
    addDrug(); 
});
