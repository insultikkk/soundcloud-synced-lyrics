const enabled = document.querySelector("#enabled");
const openOptions = document.querySelector("#open-options");

void chrome.storage.local.get({ enabled: true }).then((settings) => {
  enabled.checked = settings.enabled;
});

enabled.addEventListener("change", () => {
  void chrome.storage.local.set({ enabled: enabled.checked });
});

openOptions.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
