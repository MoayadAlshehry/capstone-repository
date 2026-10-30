/** Next copies its private fields itself. Forward application state so native URL updates are observed. */
export function pushPublicHistory(href: string) {
  const state = { ...history.state };
  delete state.__NA;
  delete state._N;
  delete state.__PRIVATE_NEXTJS_INTERNALS_TREE;
  history.pushState(state, '', href);
}
