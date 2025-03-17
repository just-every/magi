"""
supervisor.py - Defines the supervisor agent that orchestrates specialized agents
"""

# Import from common utility modules
from agents import Agent, ModelSettings
from magi.magi_agents import AGENT_DESCRIPTIONS, DOCKER_ENV_TEXT, COMMON_WARNINGS, SELF_SUFFICIENCY_TEXT
from magi.magi_agents.workers.manager_agent import create_manager_agent
from magi.magi_agents.workers.reasoning_agent import create_reasoning_agent

def create_supervisor_agent() -> Agent:
    """Creates the Supervisor agent that orchestrates specialized agents as tools."""

    return Agent(
        name="Supervisor",
        instructions=f"""You are an intelligent orchestration engine that can efficiently split both simple and complex tasks into parts to be managed by a range of AI agents.

Your primary job is to figure out how to split up your task into parts so that it can be completed most efficiently and accurately. You should execute your agents in parallel wherever possible.

YOUR AGENTS:
1. {AGENT_DESCRIPTIONS["ManagerAgent"]}
2. {AGENT_DESCRIPTIONS["ReasoningAgent"]}

{COMMON_WARNINGS}

{DOCKER_ENV_TEXT}

WORKFLOW:
1. Plan out how to split up your task. If not immediately obvious, you should use a ReasoningAgent to help you plan.
2. Use ManagerAgents to perform the task as it has been split up. You can run multiple ManagerAgent in parallel if it would speed up the task. **Give each ManagerAgent enough information to complete their task autonomously.**
3. Merge the results from all your managers.
4. Verify you have completed your task. If not, you should use a ReasoningAgent and then start again.

{SELF_SUFFICIENCY_TEXT}

DO NOT TELL THE USER TO PERFORM THE TASK. USE YOUR MANAGERS TO WRITE TO CODE TO SOLVE THE TASK IF NOT IMMEDIATELY OBVIOUS. YOUR MANAGER CAN ACCESS THE WEB, RUN FULL SEARCHES, AND EXECUTE SHELL COMMANDS. THEY CAN ALSO WRITE CODE IN ANY LANGUAGE. YOUR MANAGER CAN DO ANYTHING - DO NOT GIVE UP.
        """,
        tools=[
            create_manager_agent().as_tool(
                tool_name="ManagerAgent",
                tool_description="JavaScript programming expert - can write any code requested",
            ),
            create_reasoning_agent().as_tool(
                tool_name="ReasoningAgent",
                tool_description="An expert at thinking through complicated problems.",
            ),
        ],
        model="gpt-4o",
        model_settings=ModelSettings(truncation="auto", parallel_tool_calls=True),
    )
