"""
Bulk import endpoints for CSV/Excel data.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import text
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.user import User

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/bulk")
async def bulk_import(
    request_data: dict[str, Any],
    x_tenant_id: int = Header(..., alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """
    Bulk import data to a specified table.

    Supported tables:
    - erp_project
    - erp_task
    - erp_project_budget_line
    - erp_external_collaboration
    - erp_timeentry
    - user (platform)
    - employee_profile

    Body:
    {
        "table": "erp_task",
        "data": [
            {"name": "Task 1", "description": "...", ...},
            ...
        ],
        "tenant_id": 1,
        "created_by": "user_id"
    }
    """
    table = request_data.get("table", "").lower().strip()
    data = request_data.get("data", [])
    tenant_id = request_data.get("tenant_id")
    created_by = request_data.get("created_by")

    # Validation
    if not table:
        raise HTTPException(status_code=400, detail="table is required")
    if not isinstance(data, list) or len(data) == 0:
        raise HTTPException(status_code=400, detail="data must be a non-empty array")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id is required")

    # Ensure tenant_id matches header
    if tenant_id != x_tenant_id:
        raise HTTPException(status_code=403, detail="Tenant ID mismatch")

    # Whitelist of allowed tables (security)
    allowed_tables = {
        "erp_project",
        "erp_task",
        "erp_project_budget_line",
        "erp_external_collaboration",
        "erp_timeentry",
        "employee_profile",
    }

    if table not in allowed_tables:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported table: {table}. Allowed: {', '.join(allowed_tables)}",
        )

    try:
        # For each row, insert into the database
        # Simple approach: build INSERT query dynamically
        inserted_count = 0
        failed_count = 0
        errors = []

        for idx, row in enumerate(data):
            try:
                # Add tenant_id to each row
                row["tenant_id"] = tenant_id
                if created_by:
                    row["created_by"] = created_by

                # Build column names and values
                columns = [k for k in row.keys()]
                values = [row[k] for k in columns]
                column_str = ", ".join(columns)
                placeholders = ", ".join([f":{col}" for col in columns])

                # Raw SQL insert
                query_str = f"INSERT INTO {table} ({column_str}) VALUES ({placeholders})"
                query = text(query_str)
                session.execute(query, {col: row[col] for col in columns})
                inserted_count += 1
            except Exception as e:
                failed_count += 1
                errors.append({"row": idx, "error": str(e)})

        # Commit the transaction
        session.commit()

        return {
            "success": True,
            "message": f"Imported {inserted_count} rows to {table}",
            "insertedCount": inserted_count,
            "failedCount": failed_count,
            "table": table,
            "totalRows": len(data),
            "errors": errors if errors else None,
        }

    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
