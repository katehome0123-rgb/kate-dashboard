// ここだけ書き換えれば動きます(README の手順 3 と 4 で出てくる値)。
// これらは「公開されても困らない値」です。データそのものは入っていません。
export const CONFIG = {
  // Apps Script を「ウェブアプリ」として公開したときの URL(…/exec で終わるもの)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwdcFB-RM7uRGi5u0yVsJWNj499m4pjUTdI349fTyyOEugo4fHSEgQWhIQMRzA9DontFw/exec',
  // Google Cloud で作った OAuth クライアント ID(…apps.googleusercontent.com)
  GOOGLE_CLIENT_ID: '348344706177-ckqm0mmsquhelubv9e6kf8jc1kd3trhi.apps.googleusercontent.com',
  // インセンの画面に出す担当者。今は塩野だけ。増えたら ['塩野', '○○'] のように足す。
  // (空 [] にすると、今いる担当者を全員出す。設定シートの「インセン対象」に書いた名前があれば、そちらを優先)
  INCENTIVE_PERSONS: ['塩野'],
};
