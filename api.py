#!/usr/bin/env python3
"""Consulta o meudanfe.com.br e imprime a resposta do DANFE pela chave de acesso.

Uso:
    python api.py <chave_de_acesso_44_digitos>

Exemplo:
    python api.py 35260503157268000200550010001330001808239656

Requisitos:
    pip install undetected-chromedriver selenium
    Chrome instalado (o undetected_chromedriver gerencia o driver).
"""
import json
import sys
import time

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].strip().isdigit() or len(sys.argv[1].strip()) != 44:
        print(f"Uso: {sys.argv[0]} <chave_de_acesso_44_digitos>", file=sys.stderr)
        raise SystemExit(2)

    chave = sys.argv[1].strip()
    target_url = f"https://ws.meudanfe.com.br/v2/fd/add/{chave}"

    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    driver = uc.Chrome(options=options, version_main=148)
    driver.execute_cdp_cmd("Network.enable", {})

    driver.get("https://meudanfe.com.br/#")
    time.sleep(2)

    driver.find_element(By.XPATH, '//*[@id="searchTxt"]').send_keys(chave)
    driver.find_element(By.XPATH, '//*[@id="searchBtn"]').click()

    request_id_alvo = None
    fim = time.time() + 20

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
                    print(body.get("body", ""))
                    driver.quit()
                    raise SystemExit

        time.sleep(0.5)

    print("Não encontrou a response do PUT alvo.")
    driver.quit()


if __name__ == "__main__":
    main()
