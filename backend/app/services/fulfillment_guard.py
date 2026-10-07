"""Shared opt-in guard for prototype fulfillment mutations and downstream workers."""
import os
from fastapi import HTTPException


def require_fulfillment_simulation():
    environment = os.getenv('APP_ENV', '').strip().lower()
    if environment not in {'development','dev','test','demo'} or os.getenv('FULFILLMENT_SIMULATION_ENABLED', 'false').strip().lower() != 'true':
        raise HTTPException(403, detail={'code':'fulfillment_simulation_disabled','message':'Fulfillment simulation requires an explicitly enabled development/test/demo environment'})
