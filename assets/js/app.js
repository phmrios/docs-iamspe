(function () {
  "use strict";

  var searchInput = document.getElementById("search");
  var counterEl = document.getElementById("counter");
  var listEl = document.getElementById("doc-list");
  var statusEl = document.getElementById("status-message");

  var allFiles = [];

  function normalizeText(text) {
    return text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  function sortFiles(files) {
    return files.slice().sort(function (a, b) {
      return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
    });
  }

  function showStatus(message) {
    statusEl.textContent = message;
    statusEl.hidden = false;
    listEl.hidden = true;
    listEl.innerHTML = "";
  }

  function hideStatus() {
    statusEl.hidden = true;
    listEl.hidden = false;
  }

  function renderList(files) {
    listEl.innerHTML = "";

    if (files.length === 0) {
      showStatus("Nenhum documento encontrado.");
      return;
    }

    hideStatus();

    files.forEach(function (fileName) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = "./pdfs/" + encodeURIComponent(fileName);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = fileName;
      li.appendChild(link);
      listEl.appendChild(li);
    });
  }

  function updateCounter(visibleCount, totalCount, isFiltered) {
    if (isFiltered) {
      counterEl.textContent = visibleCount + " de " + totalCount + " documentos";
    } else {
      counterEl.textContent = totalCount + " documentos disponíveis";
    }
  }

  function applyFilter() {
    var query = normalizeText(searchInput.value.trim());
    var isFiltered = query.length > 0;

    var filtered = isFiltered
      ? allFiles.filter(function (fileName) {
          return normalizeText(fileName).indexOf(query) !== -1;
        })
      : allFiles;

    updateCounter(filtered.length, allFiles.length, isFiltered);
    renderList(filtered);
  }

  function init(files) {
    allFiles = sortFiles(files);

    if (allFiles.length === 0) {
      updateCounter(0, 0, false);
      showStatus("Nenhum documento disponível.");
      return;
    }

    updateCounter(allFiles.length, allFiles.length, false);
    renderList(allFiles);
  }

  searchInput.addEventListener("input", applyFilter);

  fetch("./data/files.json")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Falha ao carregar files.json");
      }
      return response.json();
    })
    .then(function (files) {
      init(Array.isArray(files) ? files : []);
    })
    .catch(function () {
      counterEl.textContent = "";
      showStatus("Não foi possível carregar os documentos.");
    });
})();
