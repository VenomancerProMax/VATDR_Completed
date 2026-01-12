let app_id, account_id, cachedFile, cachedBase64;
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("cert-vat-de-registration");

function showModal(type, title, message) {
    const modal = document.getElementById("custom-modal");
    const titleEl = document.getElementById("modal-title");
    const iconEl = document.getElementById("modal-icon");
    const btn = document.getElementById("modal-close");

    titleEl.textContent = title;
    document.getElementById("modal-message").textContent = message;

    if (type === "success") {
        titleEl.className = "success-title";
        iconEl.textContent = "✅";
        btn.className = "submit-button success-btn";
        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = "Finalizing...";
            try {
                await ZOHO.CRM.BLUEPRINT.proceed();
                setTimeout(() => { top.location.href = top.location.href; }, 1000);
            } catch (e) {
                ZOHO.CRM.UI.Popup.closeReload();
            }
        };
    } else {
        titleEl.className = "error-title";
        iconEl.textContent = "❌";
        btn.className = "submit-button error-btn";
        btn.onclick = () => modal.classList.add("hidden");
    }
    modal.classList.remove("hidden");
}

function clearErrors() {
    document.querySelectorAll(".error-message").forEach(s => s.textContent = "");
}

function showError(id, msg) {
    const e = document.getElementById(`error-${id}`);
    if (e) e.textContent = msg;
}

async function handleFile(file) {
    if(!file) return;
    if(file.size > 10 * 1024 * 1024) {
        showError("cert-vat-de-registration", "File size must not exceed 10MB.");
        return;
    }
    document.getElementById("file-label-text").textContent = "File: " + file.name;
    const reader = new FileReader();
    reader.onload = () => {
        cachedFile = file;
        cachedBase64 = reader.result.split(",")[1];
    };
    reader.readAsDataURL(file);
}

dropZone.onclick = () => fileInput.click();
fileInput.onchange = (e) => handleFile(e.target.files[0]);
dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add("dragover"); };
dropZone.ondragleave = () => dropZone.classList.remove("dragover");
dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
};

async function closeWidget() {
    await ZOHO.CRM.UI.Popup.closeReload().catch(() => window.close());
}

ZOHO.embeddedApp.on("PageLoad", async (entity) => {
    try {
        const resp = await ZOHO.CRM.API.getRecord({ Entity: "Applications1", RecordID: entity.EntityId });
        app_id = resp.data[0].id;
        account_id = resp.data[0].Account_Name?.id;
    } catch (err) { console.error(err); }
});

document.getElementById("record-form").onsubmit = async (e) => {
    e.preventDefault();
    clearErrors();

    const effDate = document.getElementById("effective-de-registration-date").value;
    const reason = document.getElementById("reason-de-registration").value.trim();

    let hasError = false;
    if (!cachedFile) { showError("cert-vat-de-registration", "Certificate is required."); hasError = true; }
    if (!effDate) { showError("effective-de-registration-date", "Effective Date is required."); hasError = true; }
    if (!reason) { showError("reason-de-registration", "Reason is required."); hasError = true; }

    if (hasError) return;

    const btn = document.getElementById("submit_button_id");
    btn.disabled = true;
    btn.textContent = "Submitting...";
    document.getElementById("upload-buffer").classList.remove("hidden");
    document.getElementById("upload-progress").classList.add("animate");

    try {
        await ZOHO.CRM.API.updateRecord({
            Entity: "Applications1",
            APIData: { 
                id: app_id, 
                Reason_for_De_registration: reason, 
                Subform_2: [{ Type_of_Dates: "Effective De-registration Date", Date: effDate }],
                Application_Issuance_Date: effDate
            }
        });

        await ZOHO.CRM.FUNCTIONS.execute("ta_vatdr_complete_the_process_update_account", {
            arguments: JSON.stringify({ account_id, effective_de_reg_date: effDate })
        });

        await ZOHO.CRM.API.attachFile({
            Entity: "Applications1", RecordID: app_id, File: { Name: cachedFile.name, Content: cachedBase64 }
        });

        document.getElementById("upload-buffer").classList.add("hidden");
        showModal("success", "Success!", "Record updated successfully. Click OK to reload.");
    } catch (err) {
        btn.disabled = false;
        btn.textContent = "Submit";
        document.getElementById("upload-buffer").classList.add("hidden");
        showModal("error", "Error", "An unexpected error occurred. Please try again.");
    }
};

ZOHO.embeddedApp.init();