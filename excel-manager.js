const excel = require('excel4node'),
  msg = require('./msg-helper');
let workbook;
let worksheets = {};
let style = null;
module.exports.init = () => {
  msg.yellow('Initiating excel file creation');
  workbook = new excel.Workbook();

  // Add Worksheets to the workbook
  worksheets = {
    summary: workbook.addWorksheet('Summary'),
    allURLs: workbook.addWorksheet('All URLs'),
    htmlURLs: workbook.addWorksheet('HTML URLs'),
    vanityURLs: workbook.addWorksheet('Vanity URLs'),
    notOnHTTPS: workbook.addWorksheet('Not HTTPS'),
    notWWW: workbook.addWorksheet('Not WWW'),
    notClubsMigrated: workbook.addWorksheet('Not Clubs Migrated'),
    urls400s: workbook.addWorksheet('400s HTML URLs'),
    urls500s: workbook.addWorksheet('500s HTML URLs'),
    redirectURLs: workbook.addWorksheet('Redirects'),
    irURLs: workbook.addWorksheet('Infinite Redirects'),
    lrURLs: workbook.addWorksheet('Long Redirects Chain'),
    flcURLs: workbook.addWorksheet('Failing Lower Case Redirect'),
    noCanonicalURLs: workbook.addWorksheet('No Canonical')
  };

  style = workbook.createStyle({
    font: {
      color: '#000000',
      size: 12,
      bold: true
    }
  });
  const headers = ['URL', 'Initial Status Code', 'Final URL', 'Final URL Status Code',
    'Type', 'Redirect Detected', 'Long Redirect Chain (>3)', 'Infinite Redirect',
    'Still using club.', 'WWW Migrated (www.)', 'Club Migrated (/clubs/)',
    'Lower Case Redirects', 'HTTPS Migrated', 'Canonical URL', 'Valid'];

  for (const key in worksheets) {
    if (key === 'summary') {
      continue;
    }
    const worksheet = worksheets[key];
    for (let i = 1; i <= headers.length; i++) {
      worksheet.cell(1, i).string(headers[i - 1]).style(style);
    }
  }

  worksheets.summary.cell(2, 1).string('# URLs').style(style);
  worksheets.summary.cell(3, 1).string('# HTML URLs').style(style);
  worksheets.summary.cell(4, 1).string('# Vanity URLs').style(style);
  worksheets.summary.cell(5, 1).string('# 400s URLs').style(style);
  worksheets.summary.cell(6, 1).string('# 500s URLs').style(style);
  worksheets.summary.cell(7, 1).string('# Redirects URLs').style(style);
  worksheets.summary.cell(8, 1).string('# Long Redirects Chain URLs').style(style);
  worksheets.summary.cell(9, 1).string('# Infinite Redirects URLs').style(style);
  worksheets.summary.cell(10, 1).string('# Not HTTPS URLs').style(style);
  worksheets.summary.cell(11, 1).string('# Not WWW Migrated URLs').style(style);
  worksheets.summary.cell(12, 1).string('# Not Lower Case URLs').style(style);
  worksheets.summary.cell(13, 1).string('# URLs Without Canonical').style(style);
  worksheets.summary.cell(14, 1).string('# Not Migrated to /clubs').style(style);
};
const writeDataToWorksheet = (worksheet, rows) => {

  for (const [index, statusCode] of rows.entries()) {
    const rowNum = index + 2;
    worksheet.cell(rowNum, 1).string(statusCode.url.url);
    worksheet.cell(rowNum, 2).string(statusCode.redirects[0].status);
    worksheet.cell(rowNum, 3).string(statusCode.redirects[statusCode.redirects.length - 1].url);
    worksheet.cell(rowNum, 4).string(statusCode.redirects[statusCode.redirects.length - 1].status);
    worksheet.cell(rowNum, 5).string(statusCode.type);
    worksheet.cell(rowNum, 6).string((statusCode.redirect ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 7).string((statusCode.longRedirect ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 8).string((statusCode.infiniteRedirect ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 9).string((statusCode.clupsNotMigrated ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 10).string((statusCode.wwwMigrated ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 11).string((statusCode.clubMigrated ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 12).string((statusCode.lowerCaseRedirect ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 13).string((statusCode.onHTTPS ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 14).string(statusCode.meta.canonical);
    worksheet.cell(rowNum, 15).string(statusCode.valid ? 'Yes' : 'No');
  }
}
module.exports.writeData = (rows) => {
  //Restructure the data array
  const data = [];
  for (const row of rows) {
    for (const [index, col] of row.entries()) {
      data[index] = data[index] ? data[index] : [];
      data[index].push(col);
    }
  }

  msg.yellow('Writing data to the excel file');
  const urls = [];
  for (const [index, audit] of data.entries()) {
    urls[index] = urls[index] ? urls[index] : {};

    urls[index].all = data[index];
    urls[index].htmlURLs = audit.filter((statusCode) => {
      return statusCode.type === 'HTML';
    });
    urls[index].vanityURLs = urls[index].htmlURLs.filter((statusCode) => {
      const firstURL = statusCode.redirects[0];
      return firstURL.url.indexOf('club.com') !== -1;
    });
    urls[index].urls400s = urls[index].htmlURLs.filter((statusCode) => {
      const lastRedirect = statusCode.redirects[statusCode.redirects.length - 1];
      return (lastRedirect.status >= 400 && lastRedirect.status <= 410) ||
        lastRedirect.status === '404s' || lastRedirect.status === '404o';
    });
    urls[index].urls500s = urls[index].htmlURLs.filter((statusCode) => {
      const lastRedirect = statusCode.redirects[statusCode.redirects.length - 1];
      return (lastRedirect.status >= 500 && lastRedirect.status <= 510);
    });
    urls[index].redirectURLs = urls[index].htmlURLs.filter((statusCode) => {
      return statusCode.redirect;
    });
    urls[index].lrURLs = urls[index].htmlURLs.filter((statusCode) => {
      return statusCode.longRedirect;
    });
    urls[index].irURLs = urls[index].htmlURLs.filter((statusCode) => {
      return statusCode.infiniteRedirect;
    });
    urls[index].notOnHTTPS = urls[index].htmlURLs.filter((statusCode) => {
      return !statusCode.onHTTPS;
    });
    urls[index].notWWW = urls[index].htmlURLs.filter((statusCode) => {
      return !statusCode.wwwMigrated;
    });
    urls[index].flcURLs = urls[index].htmlURLs.filter((statusCode) => {
      return !statusCode.lowerCaseRedirect;
    });
    urls[index].noCanonicalURLs = urls[index].htmlURLs.filter((statusCode) => {
      return statusCode.meta.canonical === '';
    });
    urls[index].notClubsMigrated = urls[index].htmlURLs.filter((statusCode) => {
      return !statusCode.clubMigrated;
    });
  }

  //Update the summary tab
  for (const [index, audit] of data.entries()) {
    const colIndex = index + 2;
    worksheets.summary.cell(1, colIndex).date(new Date(urls[index].htmlURLs[0].created)).style(style);
    worksheets.summary.cell(2, colIndex).number(urls[index].all.length);
    worksheets.summary.cell(3, colIndex).number(urls[index].htmlURLs.length);
    worksheets.summary.cell(4, colIndex).number(urls[index].vanityURLs.length);
    worksheets.summary.cell(5, colIndex).number(urls[index].urls400s.length);
    worksheets.summary.cell(6, colIndex).number(urls[index].urls500s.length);
    worksheets.summary.cell(7, colIndex).number(urls[index].redirectURLs.length);
    worksheets.summary.cell(8, colIndex).number(urls[index].lrURLs.length);
    worksheets.summary.cell(9, colIndex).number(urls[index].irURLs.length);
    worksheets.summary.cell(10, colIndex).number(urls[index].notOnHTTPS.length);
    worksheets.summary.cell(11, colIndex).number(urls[index].notWWW.length);
    worksheets.summary.cell(12, colIndex).number(urls[index].flcURLs.length);
    worksheets.summary.cell(13, colIndex).number(urls[index].noCanonicalURLs.length);
    worksheets.summary.cell(14, colIndex).number(urls[index].notClubsMigrated.length);
  }


  //Update other worksheets
  writeDataToWorksheet(worksheets.allURLs, urls[0].all);
  writeDataToWorksheet(worksheets.htmlURLs, urls[0].htmlURLs);
  writeDataToWorksheet(worksheets.vanityURLs, urls[0].vanityURLs);
  writeDataToWorksheet(worksheets.urls400s, urls[0].urls400s);
  writeDataToWorksheet(worksheets.urls500s, urls[0].urls500s);
  writeDataToWorksheet(worksheets.redirectURLs, urls[0].redirectURLs);
  writeDataToWorksheet(worksheets.lrURLs, urls[0].lrURLs);
  writeDataToWorksheet(worksheets.irURLs, urls[0].irURLs);
  writeDataToWorksheet(worksheets.notOnHTTPS, urls[0].notOnHTTPS);
  writeDataToWorksheet(worksheets.notWWW, urls[0].notWWW);
  writeDataToWorksheet(worksheets.flcURLs, urls[0].flcURLs);
  writeDataToWorksheet(worksheets.noCanonicalURLs, urls[0].noCanonicalURLs);
  writeDataToWorksheet(worksheets.notClubsMigrated, urls[0].notClubsMigrated);
};

module.exports.flush = (path) => {
  workbook.write(path);
  msg.green('Excel file was created successfully: ' + path);
};
