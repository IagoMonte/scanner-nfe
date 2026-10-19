#!/usr/bin/env python3
"""Consulta o meudanfe.com.br e imprime a resposta do DANFE pela chave de acesso.

Uso:
    python api.py <chave_de_acesso_44_digitos>

Exemplo:
    python api.py 35260503157268000200550010001330001808239656

Requisitos:
    pip install undetected-chromedriver selenium
    Chrome instalado (o undetected_chromedriver gerencia o driver).

Estrutura interna em módulos:
    carregar_chave        — validação da linha de comando
    configurar_driver     — Chrome/CDP com captura de rede habilitada
    buscar_no_site        — digita a chave e dispara a busca no meudanfe
    localizar_resposta_put — varre os logs CDP atrás do PUT alvo (coração da captura)
    main                  — sequência completa
"""
import json
import sys
import time

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By

SITE = "https://meudanfe.com.br/#"
URL_BASE = "https://ws.meudanfe.com.br/v2/fd/add/"

def carregar_chave(argv) -> str:
    """Valida a linha de comando: exatamente 1 argumento, 44 dígitos."""
    if len(argv) != 2 or not argv[1].strip().isdigit() or len(argv[1].strip()) != 44:
        print(f"Uso: {argv[0]} <chave_de_acesso_44_digitos>", file=sys.stderr)
        raise SystemExit(2)
    return argv[1].strip()


def configurar_driver() -> "uc.Chrome":
    """Abre o Chrome com os logs de performance (rede) habilitados."""
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    driver = uc.Chrome(options=options, version_main=148)
    driver.execute_cdp_cmd("Network.enable", {})
    return driver


def buscar_no_site(driver, chave: str) -> None:
    """Digita a chave no meudanfe.com.br e clica em buscar."""
    driver.get(SITE)
    time.sleep(2)

    driver.find_element(By.XPATH, '//*[@id="searchTxt"]').send_keys(chave)
    driver.find_element(By.XPATH, '//*[@id="searchBtn"]').click()


def localizar_resposta_put(driver, target_url: str, segundos: int) -> str | None:
    """Varre os logs de rede até achar a response do PUT alvo; None se expirar.

    Duas pistas precisam casar: o request é um PUT para target_url
    (guardamos o requestId) e a response carrega esse mesmo requestId.
    """
    request_id_alvo = None
    fim = time.time() + segundos

    while time.time() < fim:
        for entry in driver.get_log("performance"):
            msg = json.loads(entry["message"])["message"]
            method = msg.get("method", "")
            params = msg.get("params", {})

            if method == "Network.requestWillBeSent":
                req = params.get("request", {})
                url = req.get("url", "")
                http_method = req.get("method", "")

                if http_method == "PUT" and url.startswith(target_url):
                    request_id_alvo = params.get("requestId")

            if method == "Network.responseReceived":
                request_id = params.get("requestId")
                response = params.get("response", {})
                url = response.get("url", "")

                if request_id_alvo and request_id == request_id_alvo and url.startswith(target_url):
                    body = driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": request_id})
                    return body.get("body", "")

        time.sleep(0.5)

    return None


def main() -> None:
    chave = carregar_chave(sys.argv)
    target_url = f"{URL_BASE}{chave}"

    driver = configurar_driver()
    buscar_no_site(driver, chave)
    body = localizar_resposta_put(driver, target_url, 20)

    if body is not None:
        print(body)
        driver.quit()
        raise SystemExit

    print("Não encontrou a response do PUT alvo.")
    driver.quit()


if __name__ == "__main__":
    main()
