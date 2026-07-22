#!/usr/bin/env python3
"""将 Pixso 导出的单色 SVG 规范化为可继承 currentColor 的图标。"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


SVG_NAMESPACE: str = "http://www.w3.org/2000/svg"
XLINK_NAMESPACE: str = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NAMESPACE)
ET.register_namespace("xlink", XLINK_NAMESPACE)

COLOR_PROPERTIES: frozenset[str] = frozenset({"fill", "stroke"})
UNTOUCHED_COLOR_VALUES: frozenset[str] = frozenset(
    {"", "none", "currentcolor", "inherit", "initial", "unset", "transparent"}
)
SVG_ELEMENTS_WITH_PAINT: frozenset[str] = frozenset(
    {"circle", "ellipse", "line", "path", "polygon", "polyline", "rect", "text", "use"}
)
URL_REFERENCE_PATTERN: re.Pattern[str] = re.compile(r"url\(\s*#([^)\s]+)\s*\)")
STYLE_COLOR_PATTERN: re.Pattern[str] = re.compile(r"(?P<name>fill|stroke)\s*:\s*(?P<value>[^;}]+)", re.IGNORECASE)


@dataclass(frozen=True)
class ConversionResult:
    changed: bool
    warnings: tuple[str, ...]


def local_name(tag: str) -> str:
    """返回不包含 XML 命名空间的元素名称。"""
    return tag.rsplit("}", 1)[-1]


def normalize_color(value: str) -> str:
    """保留语义值与引用，其余显式颜色替换为 currentColor。"""
    normalized_value: str = value.strip()
    if normalized_value.casefold() in UNTOUCHED_COLOR_VALUES or "url(" in normalized_value.casefold():
        return normalized_value
    return "currentColor"


def normalize_style(style: str) -> str:
    """替换 style 属性中的 fill 与 stroke 声明。"""
    def replace(match: re.Match[str]) -> str:
        property_name: str = match.group("name")
        color_value: str = match.group("value")
        return f"{property_name}: {normalize_color(color_value)}"

    return STYLE_COLOR_PATTERN.sub(replace, style)


def parse_view_box(root: ET.Element) -> tuple[float, float, float, float] | None:
    """解析 viewBox，用于识别 Pixso 生成的无意义背景矩形。"""
    view_box: str | None = root.get("viewBox")
    if view_box is None:
        return None

    values: list[str] = view_box.replace(",", " ").split()
    if len(values) != 4:
        return None

    try:
        x: float = float(values[0])
        y: float = float(values[1])
        width: float = float(values[2])
        height: float = float(values[3])
        return x, y, width, height
    except ValueError:
        return None


def parse_svg_length(value: str | None) -> float | None:
    """解析无单位或 px 单位的 SVG 长度。"""
    if value is None:
        return None
    matched_value: re.Match[str] | None = re.fullmatch(r"\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:px)?\s*", value)
    return float(matched_value.group(1)) if matched_value is not None else None


def format_svg_number(value: float) -> str:
    """输出紧凑且稳定的 SVG 数值。"""
    return str(int(value)) if value.is_integer() else f"{value:g}"


def ensure_view_box(root: ET.Element) -> tuple[float, float, float, float] | None:
    """保留已有 viewBox，或由纯数字宽高补齐标准坐标系。"""
    view_box: tuple[float, float, float, float] | None = parse_view_box(root)
    if view_box is not None:
        return view_box

    width: float | None = parse_svg_length(root.get("width"))
    height: float | None = parse_svg_length(root.get("height"))
    if width is None or height is None or width <= 0 or height <= 0:
        return None

    root.set("viewBox", f"0 0 {format_svg_number(width)} {format_svg_number(height)}")
    return 0.0, 0.0, width, height


def equals_float(left: str | None, right: float) -> bool:
    """比较 SVG 数值属性与 viewBox 数值。"""
    if left is None:
        return False
    try:
        return abs(float(left) - right) < 0.000001
    except ValueError:
        return False


def is_pixso_background(element: ET.Element, icon_name: str, view_box: tuple[float, float, float, float] | None) -> bool:
    """只移除与文件同名且铺满画布的 Pixso 背景矩形，避免误删正常图形。"""
    if view_box is None or local_name(element.tag) != "rect":
        return False

    element_id: str = element.get("id", "").casefold()
    if element_id != icon_name.casefold():
        return False

    x, y, width, height = view_box
    return (
        equals_float(element.get("x", "0"), x)
        and equals_float(element.get("y", "0"), y)
        and equals_float(element.get("width"), width)
        and equals_float(element.get("height"), height)
    )


def is_hidden_pixso_grid(element: ET.Element) -> bool:
    """移除 Pixso 导出时残留的透明图标网格。"""
    if local_name(element.tag) != "g":
        return False

    element_id: str = element.get("id", "").casefold()
    opacity: str = element.get("opacity", "").strip()
    return opacity in {"0", "0.0", "0.00"} and ("图标网格" in element_id or "icon grid" in element_id)


def is_empty_path(element: ET.Element) -> bool:
    """移除 Pixso 偶尔导出的空 path。"""
    return local_name(element.tag) == "path" and not element.get("d", "").strip()


def collect_url_references(elements: Iterable[ET.Element]) -> set[str]:
    """收集 SVG 元素属性内引用的 defs 标识。"""
    references: set[str] = set()
    for element in elements:
        for attribute_value in element.attrib.values():
            references.update(URL_REFERENCE_PATTERN.findall(attribute_value))
    return references


def remove_unused_defs(root: ET.Element) -> bool:
    """删除因移除 Pixso 网格而变为无引用的 defs 条目。"""
    changed: bool = False
    references: set[str] = collect_url_references(root.iter())
    for defs in list(root):
        if local_name(defs.tag) != "defs":
            continue

        for definition in list(defs):
            definition_id: str | None = definition.get("id")
            if definition_id is not None and definition_id not in references:
                defs.remove(definition)
                changed = True

        if len(defs) == 0:
            root.remove(defs)
            changed = True
    return changed


def convert_svg(source: str, icon_name: str) -> tuple[str, ConversionResult]:
    """清理 Pixso 导出数据，并将单色绘制属性改为 currentColor。"""
    root: ET.Element = ET.fromstring(source)
    changed: bool = False
    warnings: list[str] = []
    view_box: tuple[float, float, float, float] | None = ensure_view_box(root)

    if view_box is None:
        warnings.append("缺少有效 viewBox，保留原始尺寸")
    else:
        for dimension_name in ("width", "height"):
            if dimension_name in root.attrib:
                del root.attrib[dimension_name]
                changed = True

    for child in list(root):
        if is_pixso_background(child, icon_name, view_box) or is_hidden_pixso_grid(child):
            root.remove(child)
            changed = True

    for parent in root.iter():
        for child in list(parent):
            if is_empty_path(child):
                parent.remove(child)
                changed = True

    for element in root.iter():
        element_name: str = local_name(element.tag)
        if element_name not in SVG_ELEMENTS_WITH_PAINT and element is not root:
            continue

        for property_name in COLOR_PROPERTIES:
            color_value: str | None = element.get(property_name)
            if color_value is None:
                continue
            normalized_color: str = normalize_color(color_value)
            if normalized_color != color_value:
                element.set(property_name, normalized_color)
                changed = True
            if "url(" in color_value.casefold():
                warnings.append(f"{property_name} 仍引用渐变或图案")

        style_value: str | None = element.get("style")
        if style_value is not None:
            normalized_style: str = normalize_style(style_value)
            if normalized_style != style_value:
                element.set("style", normalized_style)
                changed = True
            if "url(" in style_value.casefold():
                warnings.append("style 仍引用渐变或图案")

    if remove_unused_defs(root):
        changed = True

    normalized_svg: str = ET.tostring(root, encoding="unicode", short_empty_elements=True)
    if source.lstrip().startswith("<?xml"):
        normalized_svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + normalized_svg
    normalized_svg += "\n"
    return normalized_svg, ConversionResult(changed=changed or normalized_svg != source, warnings=tuple(sorted(set(warnings))))


def read_utf8(path: Path) -> tuple[str, bool]:
    """读取 UTF-8 SVG，并记录 BOM 以便写回时保持编码形式。"""
    raw_content: bytes = path.read_bytes()
    has_bom: bool = raw_content.startswith(b"\xef\xbb\xbf")
    return raw_content.decode("utf-8-sig"), has_bom


def write_utf8(path: Path, content: str, has_bom: bool) -> None:
    """使用原有的 UTF-8 BOM 形式写回 SVG。"""
    prefix: bytes = b"\xef\xbb\xbf" if has_bom else b""
    path.write_bytes(prefix + content.encode("utf-8"))


def iter_svg_files(directory: Path) -> Iterable[Path]:
    """枚举需处理的图标，明确跳过 -colorful.svg。"""
    for path in sorted(directory.glob("*.svg")):
        if path.stem.casefold().endswith("-colorful"):
            print(f"跳过彩色图标: {path.name}")
            continue
        yield path


def main() -> int:
    parser = argparse.ArgumentParser(description="规范化 Pixso 单色 SVG 图标")
    parser.add_argument("--directory", type=Path, default=Path(__file__).parent, help="SVG 图标目录")
    parser.add_argument("--write", action="store_true", help="将转换结果写回文件；缺省时仅预览")
    arguments = parser.parse_args()

    directory: Path = arguments.directory.resolve()
    if not directory.is_dir():
        print(f"目录不存在: {directory}", file=sys.stderr)
        return 2

    changed_count: int = 0
    error_count: int = 0
    for path in iter_svg_files(directory):
        try:
            source, has_bom = read_utf8(path)
            normalized_svg, result = convert_svg(source, path.stem)
        except (ET.ParseError, UnicodeDecodeError) as error:
            print(f"无法转换 {path.name}: {error}", file=sys.stderr)
            error_count += 1
            continue

        if result.changed:
            changed_count += 1
            action: str = "已转换" if arguments.write else "待转换"
            print(f"{action}: {path.name}")
            if arguments.write:
                write_utf8(path, normalized_svg, has_bom)

        for warning in result.warnings:
            print(f"警告 {path.name}: {warning}", file=sys.stderr)

    mode: str = "写入" if arguments.write else "预览"
    print(f"{mode}完成：{changed_count} 个文件需要转换。")
    return 1 if error_count > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
