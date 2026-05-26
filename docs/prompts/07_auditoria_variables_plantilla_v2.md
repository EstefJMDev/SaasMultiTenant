# Auditoria variables de plantilla (HTML/Jinja2) para snapshot contractual v2

Fecha: 2026-05-26

## 1) Alcance y fuentes

Se audito exclusivamente lo que consumen las plantillas HTML/Jinja2 actuales y
como se alimentan hoy desde el backend:

- `backend-fastapi/app/domains/procurement/contracts/templates_html/suministro.html.j2`
- `backend-fastapi/app/domains/procurement/contracts/templates_html/servicios.html.j2`
- `backend-fastapi/app/domains/procurement/contracts/templates_html/subcontratacion.html.j2`
- `backend-fastapi/app/domains/procurement/contracts/document_generator.py`
  (funcion `_build_substitution_context`)

## 2) Variables reales usadas por plantilla

### 2.1 Comun (aparecen en mas de un tipo)

- `RAZON_SOCIAL`
- `CIF`
- `DIRECCION_EMPRESA`
- `NOMBRE_GERENTE`
- `NIF_GERENTE`
- `NOMBRE_OBRA`
- `NUM_OBRA` / `NUMERO_OBRA`
- `FECHA_INICIO`
- `FECHA_FIN`
- `FORMA_PAGO`
- `DIA`, `MES`, `ANIO`
- `TOTAL_LINEAS`
- `LINEAS` (iteracion `fila.med`, `fila.uds`, `fila.descripcion`, `fila.precio`, `fila.importe`)

### 2.2 Especificas por tipo

Servicios:
- `TIPO_SERVICIO`

Suministro:
- `PROMOTORA`
- `DURACION_OBRA`
- `PORTES`
- `DESCARGAS`
- `TERMINO_PAGO`
- `HITOS` (se itera por saltos de linea)

Subcontratacion:
- `TIPO_ESCRITURA`
- `FECHA_ESCRITURA`
- `NOMBRE_NOTARIO`
- `NUMERO_PROTOCOLO`
- `PRECIO_NUMERO`
- `PRECIO_LETRA`
- `NUM_TRAB`
- `NUM_TRAB_LETRA`
- `GARANTIA`
- `SEGURO`
- `FIN_OBRA`
- `PROMOTORA`
- `DURACION_OBRA`
- `HITOS`

## 3) Clasificacion: fijo vs persistido vs derivado

## 3.1 Datos fijos de plantilla (NO persistir)

Son texto contractual fijo URDECON dentro de las plantillas:
- datos de la constructora
- clausulas estaticas
- correo corporativo fijo
- firmas fijas de la parte URDECON

No requieren columnas ni JSON.

## 3.2 Datos base que SI deben persistirse (canonicos)

Proveedor snapshot:
- razon_social
- cif
- direccion_empresa
- nombre_gerente
- nif_gerente
- responsable (si aplica)
- tipo_escritura (opcional)
- nombre_notario (opcional)
- numero_protocolo (opcional)
- fecha_escritura (opcional)

Cabecera contrato:
- tenant_id
- comparativo_id
- tipo_contrato
- numero_obra
- nombre_obra
- titulo
- estado
- fechas principales

Economico snapshot:
- importe_total / precio_total (decimal)
- forma_pago (canonico)
- condiciones_json (campos variables por tipo)

Partidas snapshot (normalizado):
- med/cantidad (decimal)
- uds/unidad
- descripcion
- precio/precio_unitario (decimal)
- importe (decimal)
- orden

Hitos (normalizado, NO texto final):
- fecha_inicio
- fecha_fin
- nombre_hito
- descripcion_hito
- orden

## 3.3 Datos derivados/formateados (NO persistir)

Los construye `_build_substitution_context` a partir de base canonica:
- `DIA`, `MES`, `ANIO`
- `PRECIO_LETRA`
- `NUM_TRAB_LETRA`
- `TOTAL_LINEAS`
- `LINEAS` ya formateadas para render
- `HITOS` como string con saltos de linea
- formatos de fecha/cantidad/importe para impresion

## 4) Diseno objetivo de snapshot v2 (acordado)

1. `public.contratos`:
- solo cabecera comun
- + `datos_contractuales_json` para campos especificos por tipo

2. `public.contrato_datos_proveedor`:
- snapshot proveedor (campos legales/identificacion)

3. `public.contrato_hitos`:
- hitos normalizados

4. `public.contrato_oferta_adjudicada`:
- snapshot economico
- `condiciones_json` para variabilidad por tipo:
  - `tipo_servicio`
  - `promotora`
  - `duracion_obra`
  - `portes`
  - `descargas`
  - `termino_pago`
  - `garantia`
  - `seguro`
  - `num_trabajadores`
  - `fin_obra`
  - otros que existan en origen

5. `public.contrato_oferta_adjudicada_partidas`:
- partidas normalizadas (sin texto final renderizado)

## 5) Gap actual vs objetivo

Estado actual en modelos v2 (`comparativos_models.py`):
- Ya existen:
  - `contratos` (cabecera)
  - `contrato_datos_proveedor`
  - `contrato_hitos`
  - `contrato_oferta_adjudicada` con `condiciones_json`
  - `contrato_oferta_adjudicada_partidas`
- Falta explicito en `contratos`:
  - `datos_contractuales_json`

Estado actual del renderer:
- `_build_substitution_context` hoy lee del modelo legacy `Contract` y JSON legacy.
- Para independencia v2, debe migrarse a lectura desde tablas v2
  (contrato + proveedor snapshot + hitos + oferta + partidas), generando
  variables derivadas en runtime.

## 6) Decision tecnica para no inflar BBDD

- NO crear una columna por variable de plantilla.
- Mantener BBDD minima:
  - columnas canonicas
  - JSON controlado para variabilidad por tipo
  - todo lo formateado se deriva en render.

## 7) Impacto directo en la siguiente implementacion

1. Completar `condiciones_json` del snapshot economico con claves por tipo.
2. Incorporar `datos_contractuales_json` en `contratos` (si se aprueba ampliacion de esquema).
3. Crear builder v2 de contexto de plantilla que no lea comparativo en vivo.
4. Mantener fallback tecnico temporal documentado solo para contratos antiguos sin snapshot.
