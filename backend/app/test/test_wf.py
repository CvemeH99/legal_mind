from app.agents.work_flow import workflow

result = workflow.run("离婚财产怎么分割？", thread_id="123456")
print(result["response"])
