from __future__ import annotations
from io import BytesIO
from pathlib import Path
import importlib
import re
def _safe_import(module_name: str):
    try:
        return importlib.import_module(module_name)
    except Exception:  # pragma: no cover
        return None
_reportlab_pdfgen_canvas = _safe_import("reportlab.pdfgen.canvas")
_pypdf = _safe_import("pypdf")
pdfplumber = _safe_import("pdfplumber")
canvas = _reportlab_pdfgen_canvas
PdfReader = getattr(_pypdf, "PdfReader", None)
PdfWriter = getattr(_pypdf, "PdfWriter", None)
def _fill_suministro_template_precise(
    template_path: Path,
    output_path: Path,
    values: dict[str, str],
) -> bool:
    if PdfReader is None or PdfWriter is None or canvas is None or pdfplumber is None:
        return False
    supplier_name = str(values.get("razon_social") or "").strip()
    supplier_tax_id = str(values.get("cif") or "").strip()
    supplier_address = str(values.get("direccion_empresa") or "").strip()
    manager_name = str(values.get("nombre_gerente") or "").strip()
    manager_nif = str(values.get("nif_gerente") or "").strip()
    project_name = str(values.get("project_name") or values.get("nombre_obra") or "").strip()
    project_number = str(values.get("project_number") or values.get("num_obra") or "").strip()
    promoter = str(values.get("promotora") or values.get("promoter") or "").strip()
    start_date = str(values.get("fecha_inicio") or "").strip()
    end_date = str(values.get("fecha_fin") or "").strip()
    duration_text = str(values.get("duracion_contrato") or values.get("duration") or "").strip()
    payment_method = str(values.get("forma_pago") or "").strip()
    milestones = str(values.get("hitos") or "").strip()
    shipping = str(values.get("portes") or "").strip()
    unloading = str(values.get("descargas") or "").strip()
    day = str(values.get("dia") or values.get("day") or "").strip()
    month = str(values.get("mes") or values.get("month") or "").strip()
    year = str(values.get("anyo") or values.get("ano") or values.get("year") or "").strip()
    def _is_red_word(word) -> bool:
        color = word.get("non_stroking_color")
        if not isinstance(color, (tuple, list)) or len(color) < 3:
            return False
        try:
            r, g, b = float(color[0]), float(color[1]), float(color[2])
            return r >= 0.5 and g <= 0.4 and b <= 0.4
        except Exception:
            return False
    def _fit_text_single_line(oc, text: str, max_width: float, base_font_size: float = 8.5) -> tuple[str, float]:
        rendered = re.sub(r"\s+", " ", str(text or "").strip())
        if not rendered:
            return "", base_font_size
        font_size = base_font_size
        while font_size > 7.5 and oc.stringWidth(rendered, "Helvetica", font_size) > max_width:
            font_size -= 0.5
        if oc.stringWidth(rendered, "Helvetica", font_size) <= max_width:
            return rendered, font_size
        suffix = "..."
        while rendered and oc.stringWidth(rendered + suffix, "Helvetica", font_size) > max_width:
            rendered = rendered[:-1]
        return (rendered + suffix) if rendered else suffix, font_size
    def _wrap_text_lines(oc, text: str, max_width: float, font_size: float, max_lines: int = 2) -> list[str]:
        cleaned = re.sub(r"\s+", " ", str(text or "").strip())
        if not cleaned:
            return []
        words = cleaned.split(" ")
        lines: list[str] = []
        current = ""
        for word in words:
            candidate = word if not current else f"{current} {word}"
            if oc.stringWidth(candidate, "Helvetica", font_size) <= max_width:
                current = candidate
                continue
            if current:
                lines.append(current)
            else:
                fitted, _ = _fit_text_single_line(oc, word, max_width=max_width, base_font_size=font_size)
                lines.append(fitted)
            current = word if current else ""
            if len(lines) >= max_lines:
                break
        if len(lines) < max_lines and current:
            lines.append(current)
        if len(lines) > max_lines:
            lines = lines[:max_lines]
        if len(lines) == max_lines and " ".join(lines) != cleaned:
            last = lines[-1]
            if not last.endswith("..."):
                fitted_last, _ = _fit_text_single_line(oc, f"{last}...", max_width=max_width, base_font_size=font_size)
                lines[-1] = fitted_last
        return lines
    def _erase_and_write(oc, pw, x, y, row_h, text, font_size=8.5):
        left_margin = 32.0 if x >= 70.0 else max(10.0, x - 2.0)
        max_width = max(120.0, pw - left_margin - 10.0)
        fitted_text, fitted_size = _fit_text_single_line(oc, text, max_width=max_width, base_font_size=font_size)
        oc.setFillColorRGB(1, 1, 1)
        oc.rect(left_margin, y - 2.0, max_width + 4.0, row_h + 4.0, fill=1, stroke=0)
        oc.setFillColorRGB(0, 0, 0)
        oc.setFont("Helvetica", fitted_size)
        oc.drawString(left_margin + 2.0, y + 0.5, fitted_text)
    def _erase_and_write_multiline(oc, pw, x, y, row_h, text, max_lines=2, font_size=8.5):
        left_margin = 32.0 if x >= 70.0 else max(10.0, x - 2.0)
        max_width = max(120.0, pw - left_margin - 10.0)
        lines = _wrap_text_lines(oc, text, max_width=max_width, font_size=font_size, max_lines=max_lines)
        if not lines:
            return
        clear_h = max(row_h * max_lines + 4.0, row_h + 4.0)
        oc.setFillColorRGB(1, 1, 1)
        oc.rect(left_margin, y - row_h * (max_lines - 1) - 2.0, max_width + 4.0, clear_h, fill=1, stroke=0)
        oc.setFillColorRGB(0, 0, 0)
        oc.setFont("Helvetica", font_size)
        for idx, line in enumerate(lines):
            line_y = y - (idx * row_h) + 0.5
            oc.drawString(left_margin + 2.0, line_y, line)
    template_reader = PdfReader(str(template_path))
    overlay_buffer = BytesIO()
    oc = canvas.Canvas(overlay_buffer)
    total_pages = len(template_reader.pages)
    with pdfplumber.open(str(template_path)) as pdf:
        for page_idx, tpl_page in enumerate(template_reader.pages):
            pw = float(tpl_page.mediabox.width)
            ph = float(tpl_page.mediabox.height)
            oc.setPageSize((pw, ph))
            pp = pdf.pages[page_idx]
            words = pp.extract_words(extra_attrs=["non_stroking_color"]) or []
            oc.setFillColorRGB(1, 1, 1)
            for w in words:
                if not _is_red_word(w):
                    continue
                x0 = float(w.get("x0", 0.0))
                x1 = float(w.get("x1", x0 + 8.0))
                top = float(w.get("top", 0.0))
                bot = float(w.get("bottom", top + 8.0))
                y = ph - bot
                h = max(8.0, bot - top)
                oc.rect(x0 - 1.0, y - 1.0, (x1 - x0) + 2.0, h + 2.0, fill=1, stroke=0)
            if page_idx == 0:
                by_text = {}
                for w in words:
                    by_text.setdefault(str(w.get("text") or ""), []).append(w)
                def _anchor(token, idx=0):
                    found = by_text.get(token) or []
                    if len(found) <= idx:
                        return None
                    it = found[idx]
                    return (float(it.get("x0", 85.0)), ph - float(it.get("bottom", 0.0)))
                row_h = 11.0
                # Fecha
                date_anchor = _anchor("Murcia,")
                if day and month and year and date_anchor:
                    _, my = date_anchor
                    _erase_and_write(oc, pw, 85.0, my, row_h, f"En Murcia, a {day} de {month} de {year}")
                # "Y D. nombre_gerente, con D.N.I. ..."
                manager_anchor_1 = _anchor("nombre_gerente", 0)
                manager_id_value = manager_nif or supplier_tax_id
                if manager_name and manager_id_value and manager_anchor_1:
                    _, ay1 = manager_anchor_1
                    address_part = f" con domicilio en {supplier_address}" if supplier_address else ""
                    _erase_and_write(
                        oc,
                        pw,
                        85.0,
                        ay1,
                        row_h,
                        f"Y D. {manager_name}, con D.N.I. {manager_id_value}{address_part}",
                    )
                # "Y D. nombre_gerente, en nombre y representacion de ..." + linea CIF
                manager_anchor_2 = _anchor("nombre_gerente", 1)
                if manager_name and supplier_name and manager_anchor_2:
                    _, ay2 = manager_anchor_2
                    domicile_part = f", con domicilio {supplier_address}" if supplier_address else ""
                    cif_part = f" y C.I.F. {supplier_tax_id}" if supplier_tax_id else ""
                    _erase_and_write_multiline(
                        oc,
                        pw,
                        85.0,
                        ay2,
                        row_h,
                        f"Y D. {manager_name}, en nombre y representacion de {supplier_name}"
                        f"{domicile_part}{cif_part}, en adelante el suministrador.",
                        max_lines=2,
                        font_size=8.5,
                    )
                # Proyecto / expediente
                project_anchor = _anchor("nombre_obra")
                if (project_name or project_number or promoter) and project_anchor:
                    _, py_proj = project_anchor
                    project_parts: list[str] = []
                    if project_name:
                        project_parts.append(project_name)
                    if project_number:
                        project_parts.append(f"(Expediente {project_number})")
                    if promoter:
                        project_parts.append(f"promovidas por {promoter}")
                    project_line = ", ".join(project_parts)
                    if project_line:
                        project_line = f"{project_line}, para las que se contrata el"
                    _erase_and_write(
                        oc,
                        pw,
                        85.0,
                        py_proj,
                        row_h,
                        project_line,
                    )
                # Fechas inicio/fin
                date_range_anchor = _anchor("fecha_inicio")
                if date_range_anchor:
                    _, fy = date_range_anchor
                    start_label = start_date or "N/D"
                    end_label = end_date or "N/D"
                    _erase_and_write(
                        oc,
                        pw,
                        85.0,
                        fy,
                        row_h,
                        f"suministro de los materiales siendo la fecha de inicio {start_label} y fecha fin {end_label}.",
                    )
                # PLAZO
                plazo_anchor = _anchor("PLAZO")
                if duration_text and plazo_anchor:
                    _, ply = plazo_anchor
                    _erase_and_write(oc, pw, 85.0, ply, row_h, f"PLAZO de entrega: {duration_text}")
                # Hitos
                hitos_anchor = _anchor("hitos")
                if milestones and hitos_anchor:
                    _, hy = hitos_anchor
                    _erase_and_write(oc, pw, 85.0, hy, row_h, milestones)
                # FORMA DE PAGO
                payment_anchor = _anchor("forma_pago")
                if payment_method and payment_anchor:
                    _, cy = payment_anchor
                    _erase_and_write(
                        oc,
                        pw,
                        85.0,
                        cy,
                        row_h,
                        f"FORMA DE PAGO sera mediante {payment_method} dentro del periodo legal establecido de pago.",
                    )
                # Portes
                shipping_anchor = _anchor("portes")
                if shipping and shipping_anchor:
                    _, sy = shipping_anchor
                    _erase_and_write(oc, pw, 85.0, sy, row_h, f"Los portes iran a cargo de {shipping}.")
                # Descargas
                unloading_anchor = _anchor("descargas")
                if unloading and unloading_anchor:
                    _, uy = unloading_anchor
                    _erase_and_write(oc, pw, 85.0, uy, row_h, f"Las descargas iran a cargo de {unloading}.")
            elif page_idx in (1, 4):  # paginas 2 y 5 (firma)
                oc.setFont("Helvetica", 8.5)
                emp_words = [w for w in words if str(w.get("text", "")).upper() == "EMPRESA" and _is_red_word(w)]
                if emp_words and supplier_name:
                    rw = emp_words[0]
                    x0e = float(rw.get("x0", 297.5))
                    bot = float(rw.get("bottom", 0.0))
                    ye = ph - bot
                    max_width = max(80.0, pw - x0e - 12.0)
                    fitted_text, fitted_size = _fit_text_single_line(
                        oc, supplier_name, max_width=max_width, base_font_size=8.5
                    )
                    oc.setFillColorRGB(0, 0, 0)
                    oc.setFont("Helvetica", fitted_size)
                    oc.drawString(x0e, ye + 0.5, fitted_text)
                alex_words = [w for w in words if str(w.get("text", "")).lower() == "alex" and _is_red_word(w)]
                if alex_words and manager_name:
                    rw = alex_words[0]
                    x0a = float(rw.get("x0", 319.8))
                    bot = float(rw.get("bottom", 0.0))
                    ya = ph - bot
                    max_width = max(80.0, pw - x0a - 12.0)
                    fitted_text, fitted_size = _fit_text_single_line(
                        oc, manager_name, max_width=max_width, base_font_size=8.5
                    )
                    oc.setFillColorRGB(0, 0, 0)
                    oc.setFont("Helvetica", fitted_size)
                    oc.drawString(x0a, ya + 0.5, fitted_text)
            if page_idx < total_pages - 1:
                oc.showPage()
    oc.save()
    overlay_buffer.seek(0)
    overlay_reader = PdfReader(overlay_buffer)
    writer = PdfWriter()
    for page_idx, tpl_page in enumerate(template_reader.pages):
        if page_idx < len(overlay_reader.pages):
            try:
                tpl_page.merge_page(overlay_reader.pages[page_idx], over=True)
            except TypeError:
                tpl_page.merge_page(overlay_reader.pages[page_idx])
        writer.add_page(tpl_page)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as out:
        writer.write(out)
    return True
