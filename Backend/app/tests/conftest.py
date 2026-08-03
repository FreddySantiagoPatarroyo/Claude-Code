import pytest
from app.main import limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    limiter.reset()
    yield
    limiter.reset()
