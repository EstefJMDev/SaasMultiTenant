import "@testing-library/jest-dom";

if (!HTMLElement.prototype.scrollTo) {
  // Chakra Menu calls scrollTo; JSDOM doesn't implement it.
  HTMLElement.prototype.scrollTo = () => {};
}
