// Shared by the /t/<code> redirect (new clicks) and the results screen (old clicks).
// Link-preview robots (WhatsApp, Facebook, Slack...) fetch a link to draw a card.
// They are not people, so they are labelled "Bot" and left out of results.
const BOT=/bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|skypeuripreview|embedly|preview|headless|python-requests|curl\/|wget|go-http-client|uptime/i;
export function isPreviewBot(ua:string){return BOT.test(ua||'');}
export function deviceFromUserAgent(ua:string){
 if(isPreviewBot(ua))return 'Bot';
 if(/ipad|tablet|kindle|silk/i.test(ua))return 'Tablet';
 if(/mobi|android|iphone|ipod/i.test(ua))return 'Mobile';
 return ua?'Desktop':'Unknown';
}
