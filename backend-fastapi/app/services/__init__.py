"""
Servicios de dominio (capa de negocio).

La idea es que la lógica de negocio viva aquí y las rutas
de FastAPI actúen solo como capa de transporte:
- Validan/parsean entrada (schemas).
- Llaman a servicios.
- Devuelven los DTOs de salida.
"""

