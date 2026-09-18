with open("src/hooks/useDashboardAnalyticsLogic.ts", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "if (parsedMyData && isMounted.current) setMyData(parsedMyData);\n      if (parsedGlobalData && isMounted.current) setGlobalData(parsedGlobalData);\n      if (parsedMyData && parsedGlobalData && isMounted.current) {\n        setLoading(false);\n      }",
    "if (parsedMyData && isMounted.current && currentFetch === fetchCounter.current) setMyData(parsedMyData);\n      if (parsedGlobalData && isMounted.current && currentFetch === fetchCounter.current) setGlobalData(parsedGlobalData);\n      if (parsedMyData && parsedGlobalData && isMounted.current && currentFetch === fetchCounter.current) {\n        setLoading(false);\n      }"
)

with open("src/hooks/useDashboardAnalyticsLogic.ts", "w", encoding="utf-8") as f:
    f.write(content)
print("Patched cache race condition")