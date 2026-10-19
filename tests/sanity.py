#!/usr/bin/env python3
"""Sanidade da suíte: quebra o código de produção de propósito e exige FALHA.

Um teste que nunca falha não valida nada (Rule 7). Este script aplica mutações
reais em viewer.js / phone.html / api.py, roda a suíte e espera que ela quebre;
no final restaura os arquivos originais (mesmo se algo der errado).

Uso:  python3 tests/sanity.py
"""

from __future__ import annotations

import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

COMANDOS = {
    "js": ["node", "--test", "tests/"],
    "py": [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
}

# (arquivo, trecho original, trecho quebrado, suíte que deve acusar)
MUTACOES = [
    ("viewer.js", "chave.slice(6, 20)", "chave.slice(6, 19)", "js"),
    ("viewer.js", "chave.slice(25, 34)", "chave.slice(24, 33)", "js"),
    ("viewer.js", "].join('\\t')", "].join(';')", "js"),
    ("viewer.js", "if (jaExiste) {", "if (false) {", "js"),
    ("viewer.js", "Date.now() + 15000", "Date.now() + 5000", "js"),
    ("viewer.js", "if (!fornecedor) {", "if (false) {", "js"),
    ("phone.html", "text.match(/\\d{44}/)", "text.match(/\\d{40}/)", "js"),
    ("api.py", 'http_method == "PUT"', 'http_method == "POST"', "py"),
]


def main() -> int:
    arquivos = {nome for nome, _, _, _ in MUTACOES}
    originais = {nome: (RAIZ / nome).read_text(encoding="utf-8") for nome in arquivos}
    problemas = 0

    try:
        for arquivo, trecho, quebrado, suite in MUTACOES:
            conteudo = originais[arquivo]
            if trecho not in conteudo:
                print(f"AVISO: trecho não encontrado em {arquivo}: {trecho}")
                problemas += 1
                continue

            (RAIZ / arquivo).write_text(conteudo.replace(trecho, quebrado, 1), encoding="utf-8")
            roda = subprocess.run(
                COMANDOS[suite],
                cwd=RAIZ,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if roda.returncode == 0:
                print(f"FALHA DA SANIDADE: nenhum teste pegou -> {arquivo}: {trecho}")
                problemas += 1
            else:
                print(f"ok: suíte acusou -> {arquivo}: {trecho}")
    finally:
        for nome, conteudo in originais.items():
            (RAIZ / nome).write_text(conteudo, encoding="utf-8")

    if problemas:
        print(f"{problemas} mutação(ões) não detectada(s)")
        return 1
    print("todas as mutações foram detectadas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
