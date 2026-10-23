# Documentos para o Hack4Guimarães

Os PDFs entregues na página do projeto no Hack4Guimarães 2035, para o júri e os mentores:

| PDF | O que é | Fonte |
| --- | --- | --- |
| [ficha-tecnica-do-simulador.pdf](ficha-tecnica-do-simulador.pdf) | Em que se baseia o simulador, o combustível, a validação, a incerteza e os limites | [src/ficha-tecnica-do-simulador.html](src/ficha-tecnica-do-simulador.html) |
| [arquitetura.pdf](arquitetura.pdf) | As peças, uma simulação do clique ao resultado, produção, escala e qualidade | [src/arquitetura.html](src/arquitetura.html) |
| [guia-rapido.pdf](guia-rapido.pdf) | Como pedir acesso e comparar duas decisões, o assistente, o histórico e a prevenção | [src/guia-rapido.html](src/guia-rapido.html) |

## Como foram feitos

- **Fontes:** cada PDF vem de uma página HTML em `src/`, com o estilo comum `src/estilo.css` (as cores e as letras da apresentação). As capturas de ecrã estão em `src/img/`.
- **A ficha técnica é uma cópia:** o conteúdo vem da página `/ficha-tecnica` do site (`landing/src/pages/DataSheetPage.tsx`), com os números de 21 de outubro de 2026 (`landing/src/data/site-data.json`). Se a página mudar, a cópia não muda sozinha: copiar o conteúdo outra vez.
- **Os números da arquitetura** (testes, decisões, intervalos da ingestão, réplicas) são de outubro de 2026; confirmar antes de voltar a entregar.

## Gerar os PDFs outra vez

Com o Chrome instalado, na raiz do repositório (macOS; noutros sistemas, o caminho do Chrome muda):

```bash
for d in ficha-tecnica-do-simulador arquitetura guia-rapido; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
    --virtual-time-budget=8000 --print-to-pdf="$PWD/docs/hackathon/$d.pdf" "file://$PWD/docs/hackathon/src/$d.html"
done
```

As letras vêm do Google Fonts, por isso é preciso internet. Depois, ver as páginas: o guia rápido deve ter 2, a arquitetura 3 e a ficha técnica 6.
