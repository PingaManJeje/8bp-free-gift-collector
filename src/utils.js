/**
 *
 * @param {string} imageSrc
 * @param {string} name
 * @param {string} quantity
 *
 */
export const makeRewardData = (imageSrc, name, quantity) => {
  return `<img src="${imageSrc}" height="25" alt="${name}"/> ${name} ${quantity}`;
};

/**
 *
 * @param {Date} date
 *
 */
export const getArchivedFileName = (date) => {
  if (!(date instanceof Date)) {
    throw new Error("Invalid input, expected a Date object.");
  }
  let year = date.getFullYear();
  let month = date.getMonth(); // 0 - Jan; 11 - Dec
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${String(month).padStart(2, "0")}-${year}`;
};
