(function () {
  "use strict";

  var listEl = document.getElementById("tool-list");
  var statusEl = document.getElementById("status-message");

  function showStatus(message) {
    statusEl.textContent = message;
    statusEl.hidden = false;
    listEl.hidden = true;
  }

  function renderList(tools) {
    listEl.innerHTML = "";

    if (tools.length === 0) {
      showStatus("Nenhuma ferramenta disponível.");
      return;
    }

    tools.forEach(function (tool) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = tool.url;
      link.innerHTML =
        '<span class="tool-title"></span><span class="tool-description"></span>';
      link.querySelector(".tool-title").textContent = tool.title;
      link.querySelector(".tool-description").textContent = tool.description;
      li.appendChild(link);
      listEl.appendChild(li);
    });
  }

  fetch("../data/tools.json")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Falha ao carregar tools.json");
      }
      return response.json();
    })
    .then(function (tools) {
      renderList(Array.isArray(tools) ? tools : []);
    })
    .catch(function () {
      showStatus("Não foi possível carregar as ferramentas.");
    });
})();
