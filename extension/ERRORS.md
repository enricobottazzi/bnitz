# BNITZ Worker errors

| HTTP status | Error |
| --- | --- |
| `400` | BNITZ generation requires a JSON request. |
| `400` | Invalid BNITZ generation input. |
| `402` | BNITZ generation has reached its spending limit. |
| `404` | Unknown BNITZ endpoint. |
| `405` | Use POST. |
| `413` | The paper text is too large for BNITZ generation. |
| `429` | Too many BNITZ requests. Try again in a minute. |
| `429` | The model is busy. Try again shortly. |
| `502` | BNITZ could not reach its model. |
| `502` | BNITZ could not generate a valid result. |
| `503` | BNITZ generation is unavailable. |
| `504` | BNITZ generation timed out. |