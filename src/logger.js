/**
 *
 * @param {"success" | "error" | "info"} type
 * @param {string} message
 *
 */
export const logger = (type, message) => {
  const colors = {
    success: "\x1b[32m",
    error: "\x1b[31m",
    info: "\x1b[36m",
    reset: "\x1b[0m",
  };
  const color = colors[type] || colors.info;
  console.log(`${color}%s${colors.reset}`, message);
};
