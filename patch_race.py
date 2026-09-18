with open("src/hooks/useDashboardAnalyticsLogic.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Add fetch counter ref
content = content.replace(
    "const isMounted = React.useRef(true);",
    "const isMounted = React.useRef(true);\n  const fetchCounter = React.useRef(0);"
)

# Increment at start of loadData
content = content.replace(
    "async function loadData() {\n    if (!isMounted.current) return;\n    setLoading(true);",
    "async function loadData() {\n    if (!isMounted.current) return;\n    fetchCounter.current += 1;\n    const currentFetch = fetchCounter.current;\n    setLoading(true);"
)

# Check before setMyData
content = content.replace(
    "if (isMounted.current) {\n        setMyData(finalMyData);\n        setMyChartMetrics(myMetrics);\n        setGlobalRawData(myRows); // para el PDF de mi actividad\n      }",
    "if (isMounted.current && currentFetch === fetchCounter.current) {\n        setMyData(finalMyData);\n        setMyChartMetrics(myMetrics);\n        setGlobalRawData(myRows); // para el PDF de mi actividad\n      }"
)

# Check before setGlobalData
content = content.replace(
    "if (isMounted.current) {\n        setGlobalData(gd);\n        setGlobalChartMetrics(EMPTY_CHART);\n      }",
    "if (isMounted.current && currentFetch === fetchCounter.current) {\n        setGlobalData(gd);\n        setGlobalChartMetrics(EMPTY_CHART);\n      }"
)

with open("src/hooks/useDashboardAnalyticsLogic.ts", "w", encoding="utf-8") as f:
    f.write(content)
print("Added race condition protection")