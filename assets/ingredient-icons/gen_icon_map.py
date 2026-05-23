#!/usr/bin/env python3
"""
KeepEat 식재료 아이콘 매핑 생성기
-----------------------------------
assets/ingredient-icons/ 안의 모든 *.webp 파일을 스캔해서
id -> require() 매핑 TypeScript 파일(iconMap.ts)을 자동 생성한다.

왜 필요한가:
  React Native(Metro 번들러)는 require('./' + id + '.webp') 같은
  '동적 경로'를 번들에 포함하지 못한다. 반드시 require('./1.webp')처럼
  '정적 문자열'이어야 한다. 그래서 613개를 일일이 명시한 매핑 파일이 필요하고,
  손으로 못 쓰니 이 스크립트로 생성한다.

사용법:
  # 1) 이 스크립트를 아이콘 폴더 또는 아무 곳에 두고
  # 2) 아이콘 폴더를 인자로 주거나, 폴더 안에서 인자 없이 실행
  cd /Users/seonyong/keepeat_front/assets/ingredient-icons
  python3 gen_icon_map.py

  # 또는 경로 지정
  python3 gen_icon_map.py /Users/seonyong/keepeat_front/assets/ingredient-icons

결과:
  같은 폴더에 iconMap.ts 생성.
  → import { INGREDIENT_ICONS } from "@/assets/ingredient-icons/iconMap";
    const src = INGREDIENT_ICONS[ingredientId];  // require 결과(number) 또는 undefined
"""

import sys
from pathlib import Path

OUT_NAME = "iconMap.ts"


def main():
    icon_dir = Path(sys.argv[1]) if len(sys.argv) >= 2 else Path.cwd()
    if not icon_dir.is_dir():
        print(f"❌ 폴더를 찾을 수 없습니다: {icon_dir}")
        sys.exit(1)

    webps = [p for p in icon_dir.glob("*.webp")]
    if not webps:
        print(f"❌ {icon_dir} 안에 .webp가 없습니다.")
        sys.exit(1)

    # 파일명(stem)이 숫자인 것만 id로 사용. 숫자 아닌 건 경고 후 제외.
    numeric, skipped = [], []
    for p in webps:
        if p.stem.isdigit():
            numeric.append((int(p.stem), p.name))
        else:
            skipped.append(p.name)

    numeric.sort(key=lambda x: x[0])

    # iconMap.ts 본문 생성
    lines = []
    lines.append("// ⚠️ 이 파일은 gen_icon_map.py로 자동 생성됨. 직접 수정하지 마세요.")
    lines.append("// 식재료 추가 시 아이콘 webp를 이 폴더에 넣고 스크립트를 다시 실행하세요.")
    lines.append("//")
    lines.append("// 사용: const src = INGREDIENT_ICONS[ingredientId]; (없으면 undefined)")
    lines.append("")
    lines.append("export const INGREDIENT_ICONS: Record<number, number> = {")
    for id_, fname in numeric:
        lines.append(f"  {id_}: require(\"./{fname}\"),")
    lines.append("};")
    lines.append("")
    lines.append(f"// 총 {len(numeric)}개 아이콘")
    lines.append("export const INGREDIENT_ICON_COUNT = " + str(len(numeric)) + ";")
    lines.append("")

    out_path = icon_dir / OUT_NAME
    out_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"📂 스캔: {icon_dir}")
    print(f"✅ 생성: {out_path}")
    print(f"📊 아이콘 {len(numeric)}개 매핑")
    if numeric:
        ids = [n[0] for n in numeric]
        print(f"   id 범위: {min(ids)} ~ {max(ids)}")
        # 연속성 체크 (빠진 id 안내)
        gaps = sorted(set(range(min(ids), max(ids) + 1)) - set(ids))
        if gaps:
            print(f"   ⚠️ 빠진 id {len(gaps)}개: {gaps[:20]}{' ...' if len(gaps)>20 else ''}")
        else:
            print(f"   ✅ 연속 (빠진 id 없음)")
    if skipped:
        print(f"⚠️ 숫자 아닌 파일명 {len(skipped)}개 제외: {skipped[:10]}")


if __name__ == "__main__":
    main()
