"""Deployment guard for annotation evaluation order.

The Docker image runs Python 3.12, which evaluates class annotations eagerly — a
class annotating a same-module name defined later crashes at import. Local dev on
Python 3.14 (PEP 649 deferred annotations) tolerates that silently, so this test
statically rejects forward references that would break the deployed runtime.
"""

import ast
import pathlib

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]


def test_no_forward_reference_annotations():
    offenders = []
    for path in sorted((BACKEND_ROOT / "app").rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        defined_at = {
            node.name: idx
            for idx, node in enumerate(tree.body)
            if isinstance(node, ast.ClassDef)
        }
        for idx, node in enumerate(tree.body):
            if not isinstance(node, ast.ClassDef):
                continue
            for stmt in node.body:
                annotation = stmt.annotation if isinstance(stmt, ast.AnnAssign) else None
                if annotation is None:
                    continue
                for name in ast.walk(annotation):
                    if (
                        isinstance(name, ast.Name)
                        and name.id in defined_at
                        and defined_at[name.id] > idx
                    ):
                        offenders.append(f"{path.name}: {node.name} -> {name.id}")
    assert offenders == [], f"annotations referencing later-defined classes: {offenders}"
