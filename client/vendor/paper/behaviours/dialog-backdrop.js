// Progressive-enhancement click-outside close for <dialog closedby="any">
// in engines without native HTMLDialogElement.prototype.closedBy support.

const KEY = Symbol.for("paper.dialog-backdrop");

if (!window[KEY] && typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype)) {
  window[KEY] = true;

  document.addEventListener("click", (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (!dialog.open || !dialog.matches(":modal")) return;
    if (dialog.getAttribute("closedby")?.toLowerCase() !== "any") return;
    if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) return;

    const rect = dialog.getBoundingClientRect();
    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (outside) dialog.close();
  });
}
