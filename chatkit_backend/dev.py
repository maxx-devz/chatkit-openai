"""Use a Selector event loop for psycopg on Windows as well as Linux."""
import asyncio
import sys

import uvicorn


def loop_factory():
    return asyncio.SelectorEventLoop()


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=int(sys.argv[1]), loop="dev:loop_factory")
