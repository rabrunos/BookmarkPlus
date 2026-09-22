document.getElementById('open').addEventListener('click', async () => {
  await chrome.tabs.create({url: chrome.runtime.getURL('bookmarks.html')});
  window.close();
});