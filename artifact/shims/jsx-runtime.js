const React = window.React;
function jsx(type, props, key) {
  return React.createElement(type, key === undefined ? props : Object.assign({}, props, { key }));
}
module.exports = { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: React.Fragment };
