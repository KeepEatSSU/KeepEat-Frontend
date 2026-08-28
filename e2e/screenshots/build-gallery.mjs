#!/usr/bin/env node
/**
 * e2e/screenshots/current/ 의 PNG 를 읽어 gallery.html 을 생성한다.
 *
 * - UI/UX 통일성 감사용: 같은 유형의 화면이 한 섹션에 나란히 보이도록
 *   파일명 → 섹션 매핑 테이블(SECTIONS)로 묶는다.
 * - 외부 의존성/CDN 없음 — 이미지는 상대 경로 참조라 오프라인에서 열린다.
 * - 실행: node e2e/screenshots/build-gallery.mjs
 *   (run.sh --catalog 가 flow 실행 후 자동 호출한다)
 */
import { readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CURRENT_DIR = join(ROOT, "current");
const OUT_FILE = join(ROOT, "gallery.html");

// 섹션 정의 — 표시 순서 그대로. 파일명(확장자 제외)이 screens 에 있으면
// 해당 섹션, 어디에도 없으면 "기타"로 들어간다.
const SECTIONS = [
  {
    title: "인증/폼",
    screens: [
      "login",
      "signup-step1",
      "signup-step2",
      "find-password-step1",
      "find-password-step2",
      "change-password",
    ],
  },
  {
    title: "목록/탭",
    screens: ["home", "recipe-list", "my-recipes", "mypage", "notifications-open"],
  },
  {
    title: "상세",
    screens: ["ingredient-detail", "recipe-detail", "add-manual"],
  },
  {
    title: "에러·validation 상태",
    screens: [
      "login-error",
      "signup-email-error",
      "signup-validation",
      "change-password-validation",
      "find-password-email-error",
    ],
  },
  { title: "기타", screens: ["add-menu", "ingredient-picker"] },
];

let files;
try {
  files = readdirSync(CURRENT_DIR).filter((f) => f.toLowerCase().endsWith(".png"));
} catch {
  console.error(`[build-gallery] ${CURRENT_DIR} 가 없습니다. 먼저 run.sh --catalog 를 실행하세요.`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`[build-gallery] ${CURRENT_DIR} 에 PNG 가 없습니다.`);
  process.exit(1);
}

const byName = new Map(files.map((f) => [f.replace(/\.png$/i, ""), f]));
const assigned = new Set();

const sections = SECTIONS.map((s) => {
  const items = s.screens
    .filter((name) => byName.has(name))
    .map((name) => {
      assigned.add(name);
      return name;
    });
  return { title: s.title, items };
});
// 매핑에 없는 파일은 "기타"에 합류 (이름순)
const leftovers = [...byName.keys()].filter((n) => !assigned.has(n)).sort();
sections[sections.length - 1].items.push(...leftovers);

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const mtime = (name) => {
  try {
    return statSync(join(CURRENT_DIR, byName.get(name))).mtime;
  } catch {
    return null;
  }
};

const cell = (name) => {
  const file = `current/${byName.get(name)}`;
  const t = mtime(name);
  const tLabel = t ? t.toLocaleString("ko-KR", { hour12: false }) : "";
  return `      <figure class="cell" data-full="${esc(file)}" title="${esc(name)} — 클릭하면 원본 크기">
        <img src="${esc(file)}" alt="${esc(name)}" loading="lazy" />
        <figcaption><strong>${esc(name)}</strong><span>${esc(tLabel)}</span></figcaption>
      </figure>`;
};

const sectionHtml = sections
  .filter((s) => s.items.length > 0)
  .map(
    (s) => `  <section>
    <h2>${esc(s.title)} <small>(${s.items.length})</small></h2>
    <div class="row">
${s.items.map(cell).join("\n")}
    </div>
  </section>`,
  )
  .join("\n");

const generatedAt = new Date().toLocaleString("ko-KR", { hour12: false });

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>KeepEat 화면 카탈로그</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
         background: #f4f4f2; color: #1b1c1a; padding: 24px 28px 64px; }
  header h1 { font-size: 22px; margin-bottom: 4px; }
  header p  { font-size: 13px; color: #6b6d68; margin-bottom: 28px; }
  section { margin-bottom: 36px; }
  h2 { font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #d9dbd5;
       margin-bottom: 14px; }
  h2 small { color: #8a8c86; font-weight: 400; }
  /* 같은 유형이 한 줄에 나란히 — 가로 스크롤 행 */
  .row { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 8px; }
  .cell { flex: 0 0 auto; width: 220px; background: #fff; border: 1px solid #e2e4de;
          border-radius: 10px; overflow: hidden; cursor: zoom-in;
          box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .cell img { display: block; width: 100%; height: auto; background: #eee; }
  .cell figcaption { display: flex; flex-direction: column; gap: 2px;
                     padding: 8px 10px; border-top: 1px solid #eef0ea; }
  .cell figcaption strong { font-size: 13px; }
  .cell figcaption span { font-size: 11px; color: #8a8c86; }
  /* 원본 크기 오버레이 */
  #lightbox { position: fixed; inset: 0; display: none; background: rgba(10,10,10,.86);
              z-index: 10; overflow: auto; cursor: zoom-out; text-align: center; }
  #lightbox.open { display: block; }
  #lightbox img { margin: 32px auto; display: block; }
  #lightbox .name { position: fixed; top: 10px; left: 16px; color: #fff;
                    font-size: 14px; text-shadow: 0 1px 2px #000; }
</style>
</head>
<body>
<header>
  <h1>KeepEat 화면 카탈로그</h1>
  <p>생성 시각: ${esc(generatedAt)} · 총 ${files.length}장 · 썸네일 클릭 시 원본 크기</p>
</header>
${sectionHtml}
<div id="lightbox"><span class="name"></span><img alt="" /></div>
<script>
  var lb = document.getElementById("lightbox");
  var lbImg = lb.querySelector("img");
  var lbName = lb.querySelector(".name");
  document.querySelectorAll(".cell").forEach(function (cell) {
    cell.addEventListener("click", function () {
      lbImg.src = cell.dataset.full;
      lbName.textContent = cell.querySelector("strong").textContent;
      lb.classList.add("open");
    });
  });
  lb.addEventListener("click", function () { lb.classList.remove("open"); lbImg.src = ""; });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { lb.classList.remove("open"); lbImg.src = ""; }
  });
</script>
</body>
</html>
`;

writeFileSync(OUT_FILE, html);
console.log(resolve(OUT_FILE));
