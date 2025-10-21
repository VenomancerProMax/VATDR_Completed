let app_id, account_id;
let cachedFile = null;
let cachedBase64 = null;

ZOHO.embeddedApp.on("PageLoad", async (entity) => {
  try {
    const entity_id = entity.EntityId;
    const appResponse = await ZOHO.CRM.API.getRecord({
      Entity: "Applications1",
      approved: "both",
      RecordID: entity_id,
    });
    const applicationData = appResponse.data[0];
    app_id = applicationData.id;
    
    // Check for Account ID and handle if missing
    if (!applicationData.Account_Name || !applicationData.Account_Name.id) {
        console.error("Application record is missing a linked Account ID. Cannot proceed with data fetch.");
        // Prevent setting account_id if null/undefined
        // The submission logic will catch this later, but useful to log now.
    } else {
        account_id = applicationData.Account_Name.id;
    }


  } catch (err) {
    console.error(err);
  }
});

function clearErrors() {
  document.querySelectorAll(".error-message").forEach(span => {
    span.textContent = "";
  });
}

function showError(fieldId, message) {
  const errorSpan = document.getElementById(`error-${fieldId}`);
  if (errorSpan) errorSpan.textContent = message;
}

function showUploadBuffer() {
  const buffer = document.getElementById("upload-buffer");
  const bar = document.getElementById("upload-progress");
  if (buffer) buffer.classList.remove("hidden");
  if (bar) {
    bar.classList.remove("animate");
    void bar.offsetWidth;
    bar.classList.add("animate");
  }
}

function hideUploadBuffer() {
  const buffer = document.getElementById("upload-buffer");
  if (buffer) buffer.classList.add("hidden");
}

async function cacheFileOnChange(event) {
  clearErrors();

  const fileInput = event.target;
  const file = fileInput?.files[0];

  if (!file) return;

  if (file.size > 20 * 1024 * 1024) {
    showError("cert-ct-vat-registration", "File size must not exceed 20MB.");
    return;
  }

  showUploadBuffer();

  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });

    cachedFile = file;
    cachedBase64 = base64;

    await new Promise((res) => setTimeout(res, 3000));
    hideUploadBuffer();
  } catch (err) {
    console.error("Error caching file:", err);
    hideUploadBuffer();
    showError("cert-vat-de-registration", "Failed to read file.");
  }
}

async function uploadFileToCRM() {
  if (!cachedFile || !cachedBase64) {
    throw new Error("No cached file");
  }

  return await ZOHO.CRM.API.attachFile({
    Entity: "Applications1",
    RecordID: app_id,
    File: {
      Name: cachedFile.name,
      Content: cachedBase64,
    },
  });
}

function hideUploadBuffer() {
  const buffer = document.getElementById("upload-buffer");
  if (buffer) buffer.classList.add("hidden");
}

async function update_record(event = null) {
  if (event) event.preventDefault();

  clearErrors();

  let hasError = false;

  const submitBtn = document.getElementById("submit_button_id");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
  }

  const effectiveDeRegDate = document.getElementById("effective-de-registration-date")?.value;
  const reasonForDeReg = document.getElementById("reason-de-registration")?.value;
  const safe_account_id = account_id ? account_id.trim() : "";

  if (!cachedFile || !cachedBase64) {
    showError("cert-vat-de-registration", "Please upload the Certificate of VAT De-Registration.");
    hasError = true;
  }
  if (!effectiveDeRegDate) {
    showError("effective-de-registration-date", "Effective De-registration Date is required.");
    hasError = true;
  }
  if (!reasonForDeReg) {
    showError("reason-de-registration", "Reason for De-registration is required.");
    hasError = true;
  }

  if (!safe_account_id) {
    showError("submit_button_id", "Error: Associated Account ID is missing. Cannot proceed.");
    hasError = true;
    console.error("FATAL ERROR: Account ID is missing.");
  }

  if (hasError) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
    return;
  }

  try {
    const subformData = [];

    if (effectiveDeRegDate) {
      subformData.push({ Type_of_Dates: "Effective De-registration Date", Date: effectiveDeRegDate });
    }

    await ZOHO.CRM.API.updateRecord({
      Entity: "Applications1",
      APIData: {
        id: app_id,
        Reason_for_De_registration: reasonForDeReg,
        Subform_2: subformData,
        Application_Issuance_Date: effectiveDeRegDate,
      }
    });

    // Pass ALL required data to the Deluge function via JSON string
    const func_name = "ta_vatdr_complete_to_auth_update_account";
    const req_data = {
        "arguments": JSON.stringify({
            "account_id": safe_account_id,
            "effective_de_reg_date": effectiveDeRegDate,
        })
    };

    const accountResponse = await ZOHO.CRM.FUNCTIONS.execute(func_name, req_data);
    console.log("Account Update Function Response:", accountResponse);

    await uploadFileToCRM();
    await ZOHO.CRM.BLUEPRINT.proceed();
    await ZOHO.CRM.UI.Popup.closeReload();

  } catch (error) {
    console.error("Error on final submit:", err);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  }
}

document.getElementById("cert-vat-de-registration").addEventListener("change", cacheFileOnChange);
document.getElementById("record-form").addEventListener("submit", update_record);

async function closeWidget() {
  await ZOHO.CRM.UI.Popup.closeReload().then(console.log);
}

ZOHO.embeddedApp.init();