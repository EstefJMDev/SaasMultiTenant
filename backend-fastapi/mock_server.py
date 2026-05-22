#!/usr/bin/env python3
"""
Mock FastAPI Server for Agent System Development
Devuelve datos realistas sin necesidad de PostgreSQL
"""

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import json

app = FastAPI(
    title="SaaS Multi-Tenant API (Mock)",
    version="0.1.0",
    description="Mock API for agent-system development"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock data by tenant
MOCK_DATA = {
    "1": {
        "users": [
            {"id": "u1", "email": "john.doe@company.com", "name": "John Doe", "role": "admin", "active": True},
            {"id": "u2", "email": "jane.smith@company.com", "name": "Jane Smith", "role": "manager", "active": True},
            {"id": "u3", "email": "bob.wilson@company.com", "name": "Bob Wilson", "role": "user", "active": True},
            {"id": "u4", "email": "alice.johnson@company.com", "name": "Alice Johnson", "role": "user", "active": False},
            {"id": "u5", "email": "charlie.brown@company.com", "name": "Charlie Brown", "role": "user", "active": True},
        ],
        "documents": [
            {"id": "d1", "title": "Q1 2025 Budget Report", "type": "report", "created_at": (datetime.now() - timedelta(days=7)).isoformat()},
            {"id": "d2", "title": "Service Agreement - Acme Corp", "type": "contract", "created_at": (datetime.now() - timedelta(days=30)).isoformat()},
            {"id": "d3", "title": "Invoice #2025-001", "type": "invoice", "created_at": (datetime.now() - timedelta(days=5)).isoformat()},
            {"id": "d4", "title": "Project Proposal - AI Integration", "type": "proposal", "created_at": (datetime.now() - timedelta(days=15)).isoformat()},
        ],
        "invoices": [
            {"id": "inv-001", "amount": 5000.00, "currency": "EUR", "status": "paid", "date": (datetime.now() - timedelta(days=30)).isoformat(), "vendor": "Tech Solutions Inc"},
            {"id": "inv-002", "amount": 3200.50, "currency": "EUR", "status": "pending", "date": (datetime.now() - timedelta(days=7)).isoformat(), "vendor": "Cloud Services Ltd"},
            {"id": "inv-003", "amount": 7500.00, "currency": "EUR", "status": "overdue", "date": (datetime.now() - timedelta(days=45)).isoformat(), "vendor": "Software Licensing Corp"},
            {"id": "inv-004", "amount": 2100.00, "currency": "EUR", "status": "pending", "date": (datetime.now() - timedelta(days=3)).isoformat(), "vendor": "Office Supplies Co"},
        ],
        "budget": {
            "id": "b1",
            "name": "2025 Operating Budget",
            "total_amount": 500000.00,
            "spent_amount": 245000.00,
            "currency": "EUR",
            "categories": [
                {"name": "Operations", "budgeted": 200000, "spent": 125000},
                {"name": "Marketing", "budgeted": 150000, "spent": 85000},
                {"name": "R&D", "budgeted": 150000, "spent": 35000},
            ]
        }
    }
}

def get_tenant_id(x_tenant_id: str = Header(None)) -> str:
    """Extract and validate tenant ID from header"""
    if not x_tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-Id header required")
    return x_tenant_id

# ============================================================================
# USER ENDPOINTS
# ============================================================================

@app.get("/api/v1/org/users")
async def list_users(x_tenant_id: str = Header(None)):
    """List all users for a tenant"""
    tenant_id = get_tenant_id(x_tenant_id)
    data = MOCK_DATA.get(tenant_id, MOCK_DATA["1"])
    return {"success": True, "data": data["users"], "total": len(data["users"])}

@app.get("/api/v1/org/users/{user_id}")
async def get_user(user_id: str, x_tenant_id: str = Header(None)):
    """Get a specific user"""
    tenant_id = get_tenant_id(x_tenant_id)
    data = MOCK_DATA.get(tenant_id, MOCK_DATA["1"])
    for user in data["users"]:
        if user["id"] == user_id:
            return {"success": True, "data": user}
    raise HTTPException(status_code=404, detail="User not found")

# ============================================================================
# DOCUMENTS ENDPOINTS
# ============================================================================

@app.get("/api/v1/documents")
async def list_documents(x_tenant_id: str = Header(None)):
    """List all documents for a tenant"""
    tenant_id = get_tenant_id(x_tenant_id)
    data = MOCK_DATA.get(tenant_id, MOCK_DATA["1"])
    return {"success": True, "data": data["documents"], "total": len(data["documents"])}

@app.get("/api/v1/documents/{document_id}")
async def get_document(document_id: str, x_tenant_id: str = Header(None)):
    """Get a specific document"""
    tenant_id = get_tenant_id(x_tenant_id)
    data = MOCK_DATA.get(tenant_id, MOCK_DATA["1"])
    for doc in data["documents"]:
        if doc["id"] == document_id:
            return {"success": True, "data": {**doc, "content": "Lorem ipsum dolor sit amet..."}}
    raise HTTPException(status_code=404, detail="Document not found")

# ============================================================================
# INVOICES ENDPOINTS
# ============================================================================

@app.get("/api/v1/invoices")
async def list_invoices(x_tenant_id: str = Header(None)):
    """List all invoices for a tenant"""
    tenant_id = get_tenant_id(x_tenant_id)
    data = MOCK_DATA.get(tenant_id, MOCK_DATA["1"])
    return {"success": True, "data": data["invoices"], "total": len(data["invoices"])}

@app.get("/api/v1/invoices/summary")
async def get_invoices_summary(x_tenant_id: str = Header(None)):
    """Get invoices summary"""
    tenant_id = get_tenant_id(x_tenant_id)
    data = MOCK_DATA.get(tenant_id, MOCK_DATA["1"])
    invoices = data["invoices"]
    return {
        "success": True,
        "data": {
            "total_invoices": len(invoices),
            "total_amount": sum(inv["amount"] for inv in invoices),
            "paid_amount": sum(inv["amount"] for inv in invoices if inv["status"] == "paid"),
            "pending_amount": sum(inv["amount"] for inv in invoices if inv["status"] == "pending"),
            "overdue_amount": sum(inv["amount"] for inv in invoices if inv["status"] == "overdue"),
        }
    }

# ============================================================================
# BUDGET ENDPOINTS
# ============================================================================

@app.get("/api/v1/budget")
async def get_budget(x_tenant_id: str = Header(None)):
    """Get budget information"""
    tenant_id = get_tenant_id(x_tenant_id)
    data = MOCK_DATA.get(tenant_id, MOCK_DATA["1"])
    budget = data["budget"]
    budget["remaining"] = budget["total_amount"] - budget["spent_amount"]
    budget["percentage_spent"] = (budget["spent_amount"] / budget["total_amount"]) * 100
    return {"success": True, "data": budget}

# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "service": "mock-api", "timestamp": datetime.now().isoformat()}

@app.get("/api/v1/health")
async def api_health():
    """API health check"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

# ============================================================================
# DEFAULT ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "SaaS Multi-Tenant API (Mock)",
        "version": "0.1.0",
        "status": "running",
        "endpoints": {
            "users": "/api/v1/org/users",
            "documents": "/api/v1/documents",
            "invoices": "/api/v1/invoices",
            "budget": "/api/v1/budget",
            "health": "/health",
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
