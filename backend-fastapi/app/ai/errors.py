class AIClientError(Exception):
    """Error base para fallos de IA."""


class AIUnavailableError(AIClientError):
    """La IA no esta disponible (timeout, conexion, etc.)."""


class AIInvalidResponseError(AIClientError):
    """La IA devolvio una respuesta invalida."""
