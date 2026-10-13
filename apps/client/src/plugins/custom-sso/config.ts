// Custom SSO plugin config (community code, not part of Docmost `ee`).
export const customSsoConfig = {
  enabled: true,
  // Backend route to start the OIDC flow (to be implemented later).
  loginUrl: "/api/custom-sso/login",
};
