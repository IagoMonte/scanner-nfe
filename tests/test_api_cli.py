#!/usr/bin/env python3
"""Testes do api.py: validação da linha de comando e filtro da resposta do PUT.

O api.py depende de Chrome + undetected_chromedriver (não instalados aqui), então
as fronteiras externas são falsificadas: módulos falsos em sys.modules, driver
falso e relógio falso. O que se valida é a lógica pura do script — argumentos,
filtro de URL/método/requestId e o que vai para o stdout.

Rodar:  python3 -m unittest discover -s tests -p 'test_*.py'
"""

from __future__ import annotations

import io
import json
import sys
import types
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
CHAVE = "35260503157268000200550010001330001808239656"
URL_ALVO = f"https://ws.meudanfe.com.br/v2/fd/add/{CHAVE}"


# ---------------------------------------------------------------- dependências


class ElementoFalso:
    def __init__(self) -> None:
        self.textos = []
        self.cliques = 0

    def send_keys(self, texto) -> None:
        self.textos.append(texto)

    def click(self) -> None:
        self.cliques += 1


class DriverFalso:
    """Driver mínimo: registra comandos CDP e devolve os logs de performance."""

    def __init__(self, logs=None) -> None:
        self.logs = list(logs or [])
        self.comandos = []
        self.urls = []
        self.quit_chamado = False
        self.elementos = []

    # API usada pelo api.py ----------------------------------------------
    def execute_cdp_cmd(self, cmd, params):
        self.comandos.append((cmd, params))
        if cmd == "Network.getResponseBody":
            return {"body": "<nfeProc>XML DA NOTFE</nfeProc>"}
        return {}

    def get(self, url) -> None:
        self.urls.append(url)

    def find_element(self, by, value):
        elemento = ElementoFalso()
        self.elementos.append((by, value, elemento))
        return elemento

    def get_log(self, nome):
        # Devolve os logs uma única vez; depois disso o loop só enxerga vazio.
        logs, self.logs = self.logs, []
        return logs

    def quit(self) -> None:
        self.quit_chamado = True


class OpcoesFalsas:
    def __init__(self) -> None:
        self.argumentos = []
        self.capacidades = {}

    def add_argument(self, arg) -> None:
        self.argumentos.append(arg)

    def set_capability(self, nome, valor) -> None:
        self.capacidades[nome] = valor


class RelogioFalso:
    """1 segundo avançado a cada chamada: o timeout de 20s estoura na hora."""

    def __init__(self) -> None:
        self.agora = 1_000.0
        self.dormidas = []

    def time(self) -> float:
        self.agora += 1.0
        return self.agora

    def sleep(self, segundos) -> None:
        self.dormidas.append(segundos)


def instalar_dependencias_falsas():
    """Coloca uc/selenium falsos em sys.modules antes de importar api."""
    estado = {"drivers": [], "chrome_chamadas": 0}

    def chrome(*args, **kwargs):
        estado["chrome_chamadas"] += 1
        driver = getattr(chrome, "driver", None)
        estado["drivers"].append(driver)
        return driver

    uc = types.ModuleType("undetected_chromedriver")
    uc.ChromeOptions = OpcoesFalsas
    uc.Chrome = chrome

    by_modulo = types.ModuleType("selenium.webdriver.common.by")

    class By:
        XPATH = "xpath"

    by_modulo.By = By

    pacotes = {
        "undetected_chromedriver": uc,
        "selenium": types.ModuleType("selenium"),
        "selenium.webdriver": types.ModuleType("selenium.webdriver"),
        "selenium.webdriver.common": types.ModuleType("selenium.webdriver.common"),
        "selenium.webdriver.common.by": by_modulo,
    }
    sys.modules.update(pacotes)
    return estado, chrome


ESTADO, CHROME = instalar_dependencias_falsas()
sys.path.insert(0, str(ROOT))
import api  # noqa: E402  (precisa vir depois das dependências falsas)


def entrada_request(chave=CHAVE, metodo="PUT", url=URL_ALVO, request_id="req-1"):
    return {
        "message": json.dumps({
            "message": {
                "method": "Network.requestWillBeSent",
                "params": {
                    "requestId": request_id,
                    "request": {"url": url, "method": metodo},
                },
            }
        })
    }


def entrada_response(url=URL_ALVO, request_id="req-1"):
    return {
        "message": json.dumps({
            "message": {
                "method": "Network.responseReceived",
                "params": {
                    "requestId": request_id,
                    "response": {"url": url},
                },
            }
        })
    }


# --------------------------------------------------------------------- testes


class ValidacaoDeArgumentos(unittest.TestCase):
    def setUp(self):
        self.relogio = RelogioFalso()
        self.patch_time = mock.patch.object(api, "time", self.relogio)
        self.patch_time.start()
        self.addCleanup(self.patch_time.stop)
        self.chamadas_antes = ESTADO["chrome_chamadas"]

    def _rodar(self, argv):
        stderr = io.StringIO()
        stdout = io.StringIO()
        with mock.patch.object(sys, "argv", argv):
            with redirect_stderr(stderr), redirect_stdout(stdout):
                with self.assertRaises(SystemExit) as capturado:
                    api.main()
        return capturado.exception.code, stderr.getvalue(), stdout.getvalue()

    def test_sem_argumentos_mostra_uso_e_sai_com_2(self):
        codigo, erro, saida = self._rodar(["api.py"])
        self.assertEqual(codigo, 2, "linha de comando inválida sai com 2")
        self.assertIn("Uso:", erro)
        self.assertIn("<chave_de_acesso_44_digitos>", erro)
        self.assertEqual(saida, "")
        self.assertEqual(ESTADO["chrome_chamadas"], self.chamadas_antes, "não abre Chrome para argumento inválido")

    def test_chave_com_letras_ou_tamanho_errado_e_rejeitada(self):
        casos = [
            ["api.py", "abc"],
            ["api.py", CHAVE[:-1]],            # 43 dígitos
            ["api.py", CHAVE + "5"],           # 45 dígitos
            ["api.py", CHAVE[:20] + "x" + CHAVE[21:]],
        ]
        for argv in casos:
            with self.subTest(argv=argv):
                codigo, erro, _ = self._rodar(argv)
                self.assertEqual(codigo, 2)
                self.assertIn("Uso:", erro)
        self.assertEqual(ESTADO["chrome_chamadas"], self.chamadas_antes)


class FluxoDeConsulta(unittest.TestCase):
    def setUp(self):
        self.relogio = RelogioFalso()
        self.patch_time = mock.patch.object(api, "time", self.relogio)
        self.patch_time.start()
        self.addCleanup(self.patch_time.stop)

    def _rodar_com(self, logs, argv=None):
        driver = DriverFalso(logs)
        CHROME.driver = driver
        stdout = io.StringIO()
        stderr = io.StringIO()
        codigo, exitou = None, False
        with mock.patch.object(sys, "argv", argv or ["api.py", CHAVE]):
            with redirect_stdout(stdout), redirect_stderr(stderr):
                try:
                    api.main()
                except SystemExit as exc:  # caminho de sucesso sai por SystemExit
                    codigo, exitou = exc.code, True
        return codigo, exitou, stdout.getvalue(), stderr.getvalue(), driver

    def test_imprime_o_corpo_da_resposta_do_put_alvo(self):
        logs = [
            entrada_response(),                 # estranha: chega antes do requestId alvo
            entrada_request(),
            entrada_response(),
        ]
        codigo, exitou, saida, erro, driver = self._rodar_com(logs)

        self.assertTrue(exitou, "com a response encontrada o script encerra por SystemExit")
        self.assertIsNone(codigo, "sucesso sai sem código de erro")
        self.assertEqual(saida.strip(), "<nfeProc>XML DA NOTFE</nfeProc>", "o XML vai para o stdout")
        self.assertEqual(erro, "")
        self.assertTrue(driver.quit_chamado, "o Chrome precisa fechar")
        self.assertIn(("Network.enable", {}), driver.comandos)
        self.assertEqual(driver.urls[0], "https://meudanfe.com.br/#", "abre o site antes de buscar")
        self.assertEqual(driver.elementos[0][1], '//*[@id="searchTxt"]', "campo de busca correto")
        self.assertEqual(driver.elementos[0][2].textos, [CHAVE], "digita a chave no campo de busca")
        self.assertTrue(driver.elementos[1][2].cliques, "clica no botão de buscar")

    def test_ignora_resposta_de_outro_request_e_de_get(self):
        logs = [
            entrada_request(metodo="GET", url="https://ws.meudanfe.com.br/v2/fd/add/OUTRA", request_id="req-9"),
            entrada_response(url="https://ws.meudanfe.com.br/v2/fd/add/OUTRA", request_id="req-9"),
            entrada_request(),
            entrada_response(),
        ]
        codigo, exitou, saida, _, driver = self._rodar_com(logs)

        self.assertTrue(exitou)
        self.assertIsNone(codigo)
        self.assertEqual(saida.strip(), "<nfeProc>XML DA NOTFE</nfeProc>", "só a response do PUT alvo vale")
        self.assertEqual(driver.comandos.count(("Network.getResponseBody", {"requestId": "req-1"})), 1)

    def test_quando_nao_chega_response_ele_avisa_e_fecha(self):
        codigo, exitou, saida, _, driver = self._rodar_com([])

        self.assertFalse(exitou, "tempo esgotado não é exceção: o main() termina normalmente")
        self.assertIsNone(codigo)
        self.assertEqual(
            saida.strip(),
            "Não encontrou a response do PUT alvo.",
            "falha ruidosa: nunca imprime vazio em silêncio",
        )
        self.assertTrue(driver.quit_chamado)
        self.assertNotIn(
            ("Network.getResponseBody", {"requestId": "req-1"}),
            driver.comandos,
            "sem response não tenta ler corpo",
        )
        self.assertIn(0.5, self.relogio.dormidas, "espera entre varreduras dos logs")


if __name__ == "__main__":
    unittest.main()
