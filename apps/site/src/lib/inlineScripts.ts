import { ALL_ERROR_CODES } from "@agrorende/contracts/errors";

import { SITE_LOCALES } from "./locales";
import { codeToSlug, HELP_ERRORS_BASE, PAGE_KEYS, PAGE_SLUGS } from "./routes";

/**
 * Small inline scripts for progressive enhancement. The site is a static export, so these run
 * without hydration and stay readable without JavaScript (EC-SITE-05). None of them stores
 * anything, sets cookies or makes network requests.
 */

/** Lite mode after this long without the `load` event (EC-SITE-06). */
export const SLOW_LOAD_MS = 4000;

/**
 * Runs in <head> before first paint. Marks the document as scripted and switches to lite mode
 * when the browser asks to save data, reports a 2G connection, loads slowly or an image fails.
 */
export function headScript(): string {
  return `(function(){var d=document.documentElement;d.setAttribute("data-js","on");
function lite(){if(d.getAttribute("data-lite")!=="off")d.setAttribute("data-lite","on")}
try{var q=location.search;var c=navigator.connection;
if(/[?&]lite=1(&|$)/.test(q)||(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||""))))lite();
if(/[?&]lite=0(&|$)/.test(q))d.setAttribute("data-lite","off");}catch(e){}
var t=setTimeout(lite,${SLOW_LOAD_MS});window.addEventListener("load",function(){clearTimeout(t)});
document.addEventListener("error",function(e){var el=e.target;if(el&&el.tagName==="IMG"){el.setAttribute("data-failed","true");lite()}},true);
})();`;
}

/**
 * Runs at the end of <body> on every page: the "load images" retry of lite mode and the
 * unsupported-locale banner (EC-SITE-01), which is revealed when `?unsupported=` is present.
 */
export function bodyScript(): string {
  return `(function(){var d=document.documentElement;
document.addEventListener("click",function(e){var t=e.target;var b=t&&t.closest?t.closest("[data-lite-retry]"):null;
if(b){d.setAttribute("data-lite","off");var imgs=document.querySelectorAll("img[data-failed]");
for(var i=0;i<imgs.length;i++){var img=imgs[i];img.removeAttribute("data-failed");var s=img.getAttribute("src");if(s){img.setAttribute("src","");img.setAttribute("src",s)}}}
var x=t&&t.closest?t.closest("[data-dismiss]"):null;if(x){var p=document.getElementById(x.getAttribute("data-dismiss"));if(p)p.hidden=true}});
try{if(/[?&]unsupported=/.test(location.search)){var n=document.getElementById("locale-banner");if(n)n.hidden=false}}catch(e){}
})();`;
}

/** Pairs of equivalent paths (without locale, with trailing slash) used to keep the page when switching locale. */
function pathTable(): Record<string, Record<string, string>> {
  const table: Record<string, Record<string, string>> = {};
  for (const locale of SITE_LOCALES) {
    const map: Record<string, string> = {};
    for (const key of PAGE_KEYS) {
      for (const source of SITE_LOCALES) {
        const from = PAGE_SLUGS[key][source];
        const to = PAGE_SLUGS[key][locale];
        map[from.length === 0 ? "/" : `/${from.join("/")}/`] = to.length === 0 ? "/" : `/${to.join("/")}/`;
      }
    }
    table[locale] = map;
  }
  return table;
}

/**
 * Runs on the 404 and unknown-help-code pages. Static hosting cannot rewrite every case, so this
 * script recovers in the browser:
 * - wrong-case locale prefixes such as `/pt-BR/...` go to the lower-case route;
 * - unsupported locale prefixes such as `/es/...` go to the visitor's best supported locale,
 *   keeping the page when it is known, with `?unsupported=<prefix>` for the banner (EC-SITE-01);
 * - help codes typed in upper case or with underscores go to the canonical kebab-case page;
 * - unknown help codes go to the localized "help code not found" page (EC-SITE-07); the page's
 *   client components then show the typed code as text and carry it into the help search link.
 */
export function recoveryScript(): string {
  const data = {
    locales: SITE_LOCALES,
    help: Object.fromEntries(SITE_LOCALES.map((locale) => [locale, `/${HELP_ERRORS_BASE[locale].join("/")}/`])),
    unknown: Object.fromEntries(
      SITE_LOCALES.map((locale) => [locale, `/${PAGE_SLUGS.helpUnknown[locale].join("/")}/`]),
    ),
    codes: ALL_ERROR_CODES.map(codeToSlug),
    paths: pathTable(),
  };
  return `(function(){var D=${JSON.stringify(data)};
var p=location.pathname,s=location.search,h=location.hash;var m=/^\\/([^\\/]+)(\\/.*)?$/.exec(p);if(!m)return;
var seg=m[1],rest=m[2]||"/";if(rest.charAt(rest.length-1)!=="/")rest+="/";
var norm=seg.toLowerCase().replace(/_/g,"-");
function go(u){if(u!==p+s+h)location.replace(u)}
function translate(r,loc){var t=D.paths[loc];if(t[r])return t[r];
for(var i=0;i<D.locales.length;i++){var b=D.help[D.locales[i]];if(r.indexOf(b)===0)return D.help[loc]+r.slice(b.length)}return "/"}
if(D.locales.indexOf(seg)===-1){
if(D.locales.indexOf(norm)!==-1){go("/"+norm+rest+s+h);return}
if(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(norm)){var langs=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||""]);
var target="pt-br";for(var j=0;j<langs.length;j++){var l=String(langs[j]).toLowerCase();if(l.indexOf("pt")===0){target="pt-br";break}if(l.indexOf("en")===0){target="en";break}}
go("/"+target+translate(rest,target)+"?unsupported="+encodeURIComponent(norm));}
return}
var base=D.help[seg];if(rest.indexOf(base)===0){var code=rest.slice(base.length).replace(/\\/+$/,"");
if(code.indexOf("/")!==-1||code.length===0)return;var slug=code.toLowerCase().replace(/_/g,"-");
if(D.codes.indexOf(slug)!==-1){go("/"+seg+base+slug+"/");return}
if(rest!==D.unknown[seg]){go("/"+seg+D.unknown[seg]+"?code="+encodeURIComponent(code.slice(0,64)));return}}
})();`;
}
