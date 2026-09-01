
let drugCount = 0;
let selectedDiagnoses = []; 

// RESTRICTED CATEGORIES FOR OPD
const opdSubcategories = {
    "Prescription Error": ["Inappropriate selection", "Drug orders in CAPITAL LETTERS", "Illegible handwriting", "Error prone abbreviations", "Generic name written", "No/Wrong Dose", "No/Wrong Unit", "No/Wrong Frequency", "No/Wrong Route", "No/Wrong Concentration", "Non-modification (drug-drug)", "Non-modification (food-drug)", "Non-modification (hepatic/renal)"],
    "Dispensing Error": ["Wrong drug", "Wrong strength", "Wrong formulation", "Expired/Near expiry drugs", "No/Wrong Labelling", "Generic/class substitute without consultation"]
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
            <span onclick="removeDiagnosis(${idx})" style="cursor:pointer;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></span></div>`;
    });
}

function removeDiagnosis(idx) { selectedDiagnoses.splice(idx, 1); renderDiagnosisPills(); }

function updateOpdSubcategories(selectEl, targetId) {
    const category = selectEl.value;
    const subSelect = document.getElementById(targetId);
    subSelect.innerHTML = '<option value="">Select Specific Error</option>';
    if (category && opdSubcategories[category]) {
        opdSubcategories[category].forEach(sub => { subSelect.innerHTML += `<option value="${sub}">${sub}</option>`; });
    }
}

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

                        doseListEl.innerHTML = '';
                        item.doses.forEach(dose => { doseListEl.innerHTML += `<option value="${dose}">`; });

                        routeListEl.innerHTML = '';
                        const standardRoutes = ['Oral (PO)', 'Intravenous (IV)', 'Intramuscular (IM)', 'Subcutaneous (SC)', 'Sublingual (SL)', 'Topical', 'Inhalation'];
                        const allRoutes = new Set([...item.routes, ...standardRoutes]);
                        allRoutes.forEach(route => {
                            if(route && route.toUpperCase() !== 'NA') routeListEl.innerHTML += `<option value="${route}">`;
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

function toggleErrorPanel(btn, drugId) {
    const panel = document.getElementById(`error-panel-${drugId}`);
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        btn.innerHTML = '&#9888; Tag Error';
        btn.style.background = '#ff9800';
    } else {
        panel.style.display = 'block';
        btn.innerHTML = 'Cancel Error';
        btn.style.background = '#9e9e9e';
    }
}

function addOpdDrug() {
    drugCount++;
    const container = document.getElementById('opd-drugs-container');

    // Severity A-I Grid Setup
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
        `<label class="severity-item" style="padding:6px; margin:2px;">
            <input type="radio" name="sev-${drugCount}" value="${s.val}"> 
            <span class="sev-svg ${s.color}"></span> 
            <span class="sev-text" style="font-size:12px;"><b>${s.val}:</b> ${s.text}</span>
         </label>`
    ).join('');

    const rowHtml = `
        <div class="opd-drug-row" data-drug-id="${drugCount}">
            <button type="button" class="btn-remove" onclick="this.closest('.opd-drug-row').remove()" title="Remove Row" style="top: -10px; right: -10px; width:22px; height:22px; font-size:12px;">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>

            <div class="clinical-field-wrapper form-group d-display-wrapper">
                <label>Drug Name *</label>
                <input type="text" class="d-display" id="drug-display-${drugCount}" autocomplete="off" placeholder="ATC Search..." required>
                <input type="hidden" class="d-code" id="drug-code-${drugCount}">
                <ul id="drug-results-${drugCount}" class="autocomplete-dropdown" style="display:none;"></ul>
            </div>

            <div class="form-group">
                <label>Dose</label>
                <input type="text" class="d-dose" list="drug-dose-list-${drugCount}">
                <datalist id="drug-dose-list-${drugCount}"></datalist>
            </div>

            <div class="form-group">
                <label>Route</label>
                <input type="text" class="d-route" list="drug-route-list-${drugCount}">
                <datalist id="drug-route-list-${drugCount}"></datalist>
            </div>

            <div class="form-group">
                <label>Freq</label>
                <input type="text" class="d-frequency">
            </div>

            <button type="button" class="btn-tag-error" onclick="toggleErrorPanel(this, ${drugCount})">&#9888; Tag Error</button>

            <!-- HIDDEN ERROR PANEL -->
            <div class="opd-error-panel" id="error-panel-${drugCount}">
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <div class="form-group" style="flex:1; min-width:200px;">
                        <label>Category *</label>
                        <select class="e-category" onchange="updateOpdSubcategories(this, 'e-subcategory-${drugCount}')">
                            <option value="">Select</option>
                            <option value="Prescription Error">Prescription Error</option>
                            <option value="Dispensing Error">Dispensing Error</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex:1; min-width:200px;">
                        <label>Specific Error *</label>
                        <select class="e-subcategory" id="e-subcategory-${drugCount}"></select>
                    </div>
                </div>

                <div class="form-group" style="margin-top:10px;">
                    <label>Severity (NCC MERP) *</label>
                    <div class="severity-options" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">${severityHtml}</div>
                </div>

                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                    <div class="form-group" style="flex:2; min-width:200px;">
                        <label>Remarks</label>
                        <input type="text" class="e-remarks" placeholder="Brief description...">
                    </div>
                    
                </div>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', rowHtml);
    attachDrugAutocomplete(drugCount);
}

const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxXswWXgxo2IBIZPYBfVhcmLKZqL52NMlKPMBBLbpPyMHEDHmATIWTcXaOy9LY5p86yTA/exec";

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]); 
    reader.onerror = error => reject(error);
});

async function uploadToDrive(file, category) {
    if(!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL === "YOUR_APP_SCRIPT_URL_HERE") return null;
    const base64Data = await toBase64(file);
    const payload = { fileName: file.name, mimeType: file.type, data: base64Data, folderName: category };
    try {
        const res = await fetch(GOOGLE_APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', body: JSON.stringify(payload) });
        const result = await res.json();
        return (result.status === 'success') ? result.url : null;
    } catch (err) { return null; }
}

async function submitOpdForm(e) {
    e.preventDefault();

    const submitBtn = document.querySelector('.btn-submit');
    if (submitBtn.disabled) return; 

    submitBtn.disabled = true;
    submitBtn.style.backgroundColor = '#999';
    submitBtn.textContent = 'Uploading Evidence & Submitting...';

    const combinedTerms = selectedDiagnoses.map(d => d.term).join(", ");
    const combinedCodes = selectedDiagnoses.map(d => d.code).join(", ");

    const patient = {
        uhid: document.getElementById('p-uhid').value,
        encounter_type: 'OPD', // Hardcoded for this form
        department: document.getElementById('p-dept').value,
        age: parseInt(document.getElementById('p-age').value) || null,
        age_unit: document.getElementById('p-age-unit').value,
        gender: document.getElementById('p-gender').value,
        diagnosis_term: combinedTerms,
        diagnosis_code: combinedCodes,
        date_of_admission: null
    };

    const chartFile = document.getElementById('p-chart-file').files[0];
    if(chartFile) {
        submitBtn.textContent = 'Uploading Prescription...';
        patient.treatment_chart_url = await uploadToDrive(chartFile, 'PatientCharts');
    }

    const drugs = [];
    document.querySelectorAll('.opd-drug-row').forEach(async (rowEl) => {
        const drug = {
            drug_term: rowEl.querySelector('.d-display').value,
            drug_code: rowEl.querySelector('.d-code').value || null,
            dose: rowEl.querySelector('.d-dose').value,
            route: rowEl.querySelector('.d-route').value,
            frequency: rowEl.querySelector('.d-frequency').value,
            errors: []
        };

        const panel = rowEl.querySelector('.opd-error-panel');
        if (panel && panel.style.display === 'block') {
            const category = panel.querySelector('.e-category').value;
            const subCategory = panel.querySelector('.e-subcategory').value;
            const severityInput = panel.querySelector('input[type="radio"]:checked');

            // Only push error if category is actually selected
            if(category && subCategory) {
                let driveUrl = null;

                drug.errors.push({
                    error_category: category,
                    sub_category: subCategory,
                    severity: severityInput ? severityInput.value : 'A',
                    remarks: panel.querySelector('.e-remarks').value,
                    evidence_image_url: driveUrl
                });
            }
        }
        drugs.push(drug);
    });

    setTimeout(async () => {
        try {
            const response = await fetch('/api/audit/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patient, drugs, session_token: localStorage.getItem('authToken') })
            });

            const result = await response.json();
            if(response.ok) {
                alert('OPD Audit saved successfully!');
                document.getElementById('opdAuditForm').reset();
                document.getElementById('opd-drugs-container').innerHTML = '';
                document.getElementById('diagnosis-pills').innerHTML = '';
                selectedDiagnoses = [];
                drugCount = 0;
                addOpdDrug(); 
            } else alert('Backend Error: ' + JSON.stringify(result));
        } catch (err) { 
            alert('Backend connection failed.'); 
        } finally {
            submitBtn.disabled = false;
            submitBtn.style.backgroundColor = '';
            submitBtn.textContent = 'Submit OPD Audit';
        }
    }, 1000); 
}

document.addEventListener("DOMContentLoaded", () => {
    initDiagnosisAutocomplete();
    addOpdDrug(); 
});
