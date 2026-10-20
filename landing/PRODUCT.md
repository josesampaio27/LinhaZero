# Product

<!-- impeccable:product-schema 1 -->

> Written by an Impeccable review agent from `docs/proposta-desafio.md` and the owner's brief, without a live interview (subagent run). Every fact below comes from those two sources; nothing is invented. Confirm or correct with the owner.

## Platform

web

## Users

Portuguese civil protection: the commander in the first minutes of a rural fire, municipal civil protection (and the Gabinete Técnico Florestal), câmara and Laboratório da Paisagem, GNR, INEM, bombeiros. Also the people who evaluate the tool (Hack4Guimarães 2035 jury, entities). The landing page is for those who do not use it yet.

## Product Purpose

LinhaZero compares two firefighting decisions on the same rural fire and shows, in plain Portuguese with the uncertainty visible, which protects more buildings and villages. The landing makes that intelligible in seconds, shows it is credible (validated on 80 real Portuguese fires), and leads to the demonstration scenario ("Cenário de demonstração"), "Pedir acesso" or "Entrar".

## Positioning

Existing simulators answer "where does the fire go?" and are made for analysts. LinhaZero answers "which of two decisions is better, and with what confidence?" for whoever decides on the ground, with 30 paired wind variations ("B é melhor em N de 30") and the time the means take to arrive.

## Operating Context

Before (planning and training), during (first minutes) and after (debriefing) an incident. Web app in the browser. Built for Hack4Guimarães 2035, challenge 2, with Universidade do Minho (Departamento de Produção e Sistemas) and the Laboratório da Paisagem.

## Capabilities and Constraints

- Comparison sentences on the landing are templates with slots (X, aldeia, hh:mm, N, mm), never real numbers.
- The validation chart is a placeholder until the real image arrives.
- No claims about working offline on the landing.
- Data: FUMOD, Copernicus, IPMA, OpenStreetMap, Censos 2021, fogos.pt (ANEPC); a Guimarães grid of about 12 000 buildings and 88 places.
- The engine simulates without suppression in validation; it does not replace the commander's judgement.

## Brand Commitments

- Language: pt-PT, no anglicisms on buttons.
- Barlow and Barlow Condensed; decision A teal (#0b7782 / #3db6c1), decision B violet (#6447d1 / #a08cf5), fire ramp yellow to red. Dark only.
- Portuguese data, fires and pictures only. "Por portugueses, para Portugal." once, in the footer. Slogan "Simular, comparar e aperfeiçoar." heads the access section.

## Evidence on Hand

Validation on 80 PT-FireSprd fires (Sørensen table, "28 of 34"), `docs/modelo/validacao-resumo.md`. Photos in `landing/public/photos` with credits. No testimonials, customers or pilots exist yet; do not fabricate them.

## Product Principles

- The decision is the centre, not the fire.
- Honest uncertainty, always visible.
- Plain Portuguese for non-specialists.
- Made for Portugal, from Portuguese data.
