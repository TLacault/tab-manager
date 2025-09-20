// YATM Data Recovery Script
// This script can be run in the browser console to attempt data recovery

console.log("🔍 YATM Data Recovery Script");
console.log("============================");

// Function to check for any remaining data in chrome.storage.local
async function checkForRemainingData() {
  try {
    const allData = await chrome.storage.local.get(null);
    console.log("📊 Current storage data:", allData);

    // Look for any YATM-related data
    const yatmData = {};
    Object.keys(allData).forEach((key) => {
      if (
        key.includes("workspace") ||
        key.includes("folder") ||
        key.includes("recent") ||
        key.includes("background") ||
        key.includes("grain") ||
        key.includes("blur")
      ) {
        yatmData[key] = allData[key];
      }
    });

    if (Object.keys(yatmData).length > 0) {
      console.log("✅ Found potential YATM data:", yatmData);
      return yatmData;
    } else {
      console.log("❌ No YATM data found in storage");
      return null;
    }
  } catch (error) {
    console.error("❌ Error checking storage:", error);
    return null;
  }
}

// Function to export any found data
async function exportFoundData(data) {
  if (!data) {
    console.log("❌ No data to export");
    return;
  }

  const exportData = {
    ...data,
    recoveryDate: new Date().toISOString(),
    recovered: true,
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `YATM-recovery-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log("💾 Recovery data exported to file");
}

// Main recovery function
async function attemptRecovery() {
  console.log("🚀 Starting recovery process...");

  const foundData = await checkForRemainingData();

  if (foundData) {
    console.log("🎉 Recovery successful! Found data:");
    console.table(foundData);

    // Ask user if they want to export
    if (
      confirm(
        "Found potential YATM data! Would you like to export it as a backup file?"
      )
    ) {
      await exportFoundData(foundData);
    }
  } else {
    console.log("😞 No recoverable data found");
    console.log("💡 This could mean:");
    console.log("   - The data was completely wiped when you uninstalled");
    console.log("   - The extension was using a different storage key");
    console.log("   - The data was stored in a different location");
  }
}

// Run the recovery
attemptRecovery();

console.log("📝 Instructions:");
console.log(
  "1. If data was found, you can import it using the new backup feature"
);
console.log("2. Go to Settings > Data Management > Import Data");
console.log("3. Select the exported recovery file");
console.log("4. Your workspaces and data should be restored!");
