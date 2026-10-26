const fields = {
  autoOpen: document.querySelector("#autoOpen"),
  musixmatchKey: document.querySelector("#musixmatchKey"),
  geniusToken: document.querySelector("#geniusToken"),
};
const status = document.querySelector("#status");

void chrome.storage.local
  .get({ autoOpen: false, musixmatchKey: "", geniusToken: "" })
  .then((settings) => {
    fields.autoOpen.checked = settings.autoOpen;
    fields.musixmatchKey.value = settings.musixmatchKey;
    fields.geniusToken.value = settings.geniusToken;
  });

document.querySelector("#save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    autoOpen: fields.autoOpen.checked,
    musixmatchKey: fields.musixmatchKey.value.trim(),
    geniusToken: fields.geniusToken.value.trim(),
  });

  status.textContent = "Сохранено";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1800);
});
