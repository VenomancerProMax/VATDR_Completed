let app_id, account_id, cachedFile, cachedBase64;
let toastTimeout;
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("cert-vat-de-registration");

function showToast(type, title, message, duration = 4000) {
    const toast = document.getElementById("toast");
    const iconEl = document.getElementById("toast-icon");
    const titleEl = document.getElementById("toast-title");
    const progressBar = document.getElementById("toast-progress-bar");

    titleEl.textContent = title;
    document.getElementById("toast-message").textContent = message;

    toast.classList.remove("toast-success", "toast-error", "toast-show", "toast-hide", "hidden");

    if (type === "success") {
        toast.classList.add("toast-success");
        iconEl.textContent = "✅";
    } else {
        toast.classList.add("toast-error");
        iconEl.textContent = "❌";
    }

    // restart slide-in animation
    void toast.offsetWidth;
    toast.classList.add("toast-show");

    // restart progress bar animation
    progressBar.style.animation = "none";
    void progressBar.offsetWidth;
    progressBar.style.animation = `toastProgress ${duration}ms linear forwards`;

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove("toast-show");
        toast.classList.add("toast-hide");
        setTimeout(() => toast.classList.add("hidden"), 300);
    }, duration);
}

async function finalizeSuccess() {
    try {
        await ZOHO.CRM.BLUEPRINT.proceed();
        setTimeout(() => { top.location.href = top.location.href; }, 1000);
    } catch (e) {
        ZOHO.CRM.UI.Popup.closeReload();
    }
}

function clearErrors() {
    document.querySelectorAll(".error-message").forEach(s => s.textContent = "");
}

function showError(id, msg) {
    const e = document.getElementById(`error-${id}`);
    if (e) e.textContent = msg;
}

// Fixed handleFile to match the Perfect Code implementation
async function handleFile(file) {
    if(!file) return;
    clearErrors();

    if(file.size > 20 * 1024 * 1024) {
        showError("cert-vat-de-registration", "File size must not exceed 20MB.");
        return;
    }

    try {
        const content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });

        cachedFile = file;
        cachedBase64 = content;
        document.getElementById("file-label-text").textContent = "File: " + file.name;
    } catch (err) {
        console.error("Error reading file:", err);
        showError("cert-vat-de-registration", "Failed to read file.");
    }
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
    if (!cachedFile || !cachedBase64) { showError("cert-vat-de-registration", "Certificate is required."); hasError = true; }
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

        // Fixed Attachment implementation
        await ZOHO.CRM.API.attachFile({
            Entity: "Applications1", 
            RecordID: app_id, 
            File: { 
                Name: cachedFile.name, 
                Content: cachedBase64 
            }
        });

        document.getElementById("upload-buffer").classList.add("hidden");
        showToast("success", "Success!", "Record updated successfully.");
        setTimeout(() => { finalizeSuccess(); }, 2500);
    } catch (err) {
        btn.disabled = false;
        btn.textContent = "Submit";
        document.getElementById("upload-buffer").classList.add("hidden");
        showToast("error", "Error", "An unexpected error occurred. Please try again.");
    }
};

ZOHO.embeddedApp.init();