from __future__ import annotations

from app.domains.documents.utils import _normalize_field_name


def _legacy_phrase_replacements(values: dict[str, str]) -> dict[str, str]:
    supplier_name = str(values.get("razon_social") or "").strip()
    supplier_tax_id = str(values.get("cif") or "").strip()
    supplier_address = str(values.get("direccion_empresa") or "").strip()
    manager_name = str(values.get("nombre_gerente") or "").strip()
    manager_nif = str(values.get("nif_gerente") or "").strip()
    project_name = str(values.get("project_name") or values.get("nombre_obra") or "").strip()
    project_number = str(values.get("project_number") or values.get("num_obra") or "").strip()
    promoter = str(values.get("promotora") or "").strip()
    start_date = str(values.get("fecha_inicio") or "").strip()
    end_date = str(values.get("fecha_fin") or "").strip()
    duration_text = str(values.get("duracion_contrato") or "").strip()
    milestones_text = str(values.get("hitos") or "").strip()
    service_category = str(values.get("categoria_servicio") or "").strip()
    notary_name = str(values.get("notary_name") or "").strip()
    deed_date = str(values.get("deed_date") or "").strip()

    raw_map = {
        # Marcadores rojos simples de plantillas heredadas.
        "alex": manager_name,
        "empresa falsa 3 s coop": supplier_name,
        "empresa falsa 1 s a": supplier_name,
        "empresa falsa sl": supplier_name,
        "empresa falsa": supplier_name,
        "calle falsa 123": supplier_address,
        "77777777a": manager_nif,
        "88888888a": manager_nif,
        "99999999a": manager_nif,
        "a77777777": supplier_tax_id,
        "a88888888": supplier_tax_id,
        "a99999999": supplier_tax_id,
        "proyecto automate": project_name,
        "microsoft": promoter,
        "1234": project_number,
        "46058": start_date,
        "46142": end_date,
        "2 anos 2 meses y 7 dias": duration_text,
        "hitos": milestones_text,
        "su objeto social": service_category,
        "notario d pepe": f"notario d. {notary_name}" if notary_name else "",
        "46023": deed_date,
    }

    replacements: dict[str, str] = {}
    for phrase, replacement in raw_map.items():
        value = str(replacement or "").strip()
        if not value:
            continue
        replacements[_normalize_field_name(phrase)] = value
    return replacements


def _legacy_line_replacements(values: dict[str, str]) -> list[tuple[str, str]]:
    supplier_name = str(values.get("razon_social") or "").strip()
    supplier_tax_id = str(values.get("cif") or "").strip()
    supplier_address = str(values.get("direccion_empresa") or "").strip()
    manager_name = str(values.get("nombre_gerente") or "").strip()
    manager_nif = str(values.get("nif_gerente") or "").strip()
    project_name = str(values.get("project_name") or values.get("nombre_obra") or "").strip()
    project_number = str(values.get("project_number") or values.get("num_obra") or "").strip()
    promoter = str(values.get("promotora") or "").strip()
    start_date = str(values.get("fecha_inicio") or "").strip()
    end_date = str(values.get("fecha_fin") or "").strip()
    duration_text = str(values.get("duracion_contrato") or "").strip()
    milestones_text = str(values.get("hitos") or "").strip()

    replacements: list[tuple[str, str]] = []
    if manager_name and manager_nif and supplier_address:
        replacements.append(
            (
                "y_d_alex_con_d_n_i",
                f"Y D. {manager_name}, con D.N.I. {manager_nif}, con domicilio en {supplier_address}.",
            )
        )
    if manager_name and supplier_name and supplier_tax_id:
        replacements.append(
            (
                "y_d_alex_en_nombre_y_representacion_de",
                f"Y D. {manager_name}, en nombre y representacion de {supplier_name}, con C.I.F. {supplier_tax_id}.",
            )
        )
    if project_name and project_number and promoter:
        replacements.append(
            (
                "proyecto_automate",
                f"{project_name}, (Expediente {project_number}) promovidas por {promoter}.",
            )
        )
    if start_date and end_date:
        replacements.append(
            (
                "suministro_de_los_materiales_siendo_la_fecha_de_inicio",
                f"suministro de los materiales, siendo la fecha de inicio {start_date} y fecha fin {end_date}.",
            )
        )
    if duration_text:
        replacements.append(("plazo_de_entrega", f"PLAZO de entrega: {duration_text}"))
    if milestones_text:
        replacements.append(("hitos", milestones_text))
    if supplier_name:
        replacements.append(
            ("construcciones_urdecon_s_a_empresa_falsa", f"CONSTRUCCIONES URDECON, S.A. {supplier_name}")
        )
    if manager_name:
        replacements.append(
            ("fdo_enrique_fernandez_delgado_gavila_fdo_alex", f"Fdo: Enrique Fernandez-Delgado Gavila Fdo: {manager_name}")
        )
    return replacements


def _manual_template_line_replacements(values: dict[str, str]) -> list[tuple[str, str]]:
    day = str(values.get("dia") or values.get("day") or "").strip()
    month = str(values.get("mes") or values.get("month") or "").strip()
    year = str(values.get("anyo") or values.get("ano") or values.get("year") or "").strip()
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
    shipping = str(values.get("portes") or "").strip()
    unloading = str(values.get("descargas") or "").strip()

    replacements: list[tuple[str, str]] = []
    if day and month and year:
        replacements.append(("en_murcia_a_22_de_enero_de_2026", f"En Murcia, a {day} de {month} de {year}"))
    if manager_name and manager_nif and supplier_address:
        replacements.append(
            (
                "y_d_alex_con_d_n_i",
                f"Y D. {manager_name}, con D.N.I. {manager_nif} con domicilio en {supplier_address}",
            )
        )
    if manager_name and supplier_name and supplier_tax_id and supplier_address:
        replacements.append(
            (
                "y_d_alex_en_nombre_y_representacion_de_empresa_falsa",
                f"Y D. {manager_name}, en nombre y representacion de {supplier_name}, con domicilio {supplier_address} y C.I.F. {supplier_tax_id}, en adelante el suministrador.",
            )
        )
        replacements.append(("123_y_c_i_f_a88888888_en_adelante_el_suministrador", " "))
    if project_name and project_number and promoter:
        replacements.append(
            (
                "proyecto_automate",
                f"{project_name}, (Expediente {project_number}) promovidas por {promoter}, para las que se contrata el",
            )
        )
    if start_date and end_date:
        replacements.append(
            (
                "suministro_de_los_materiales_siendo_la_fecha_de_inicio",
                f"suministro de los materiales siendo la fecha de inicio {start_date} y fecha fin {end_date}.",
            )
        )
    if duration_text:
        replacements.append(("plazo_de_entrega", f"PLAZO de entrega: {duration_text}"))
    if payment_method:
        replacements.append(
            ("forma_de_pago_sera_mediante_confirming_60", f"FORMA DE PAGO sera mediante {payment_method} dentro del periodo legal establecido de pago.")
        )
    if shipping:
        replacements.append(("los_portes_iran_a_cargo_de_suministrador", f"Los portes iran a cargo de {shipping}."))
    if unloading:
        replacements.append(("las_descargas_iran_a_cargo_de_urdecon", f"Las descargas iran a cargo de {unloading}."))
    return replacements
