"""ChatKit's official Agents SDK bridge drives streaming and tool rendering."""
import logging
import os

from agents import Agent, FileSearchTool, ModelSettings, RunConfig, Runner
from chatkit.agents import AgentContext, simple_to_agent_input, stream_agent_response
from chatkit.errors import CustomStreamError
from chatkit.server import ChatKitServer
from chatkit.types import UserMessageItem

from store import Context

logger = logging.getLogger(__name__)


class PortalChatKitServer(ChatKitServer[Context]):
    async def respond(self, thread, input_user_message, context):
        result = None
        try:
            page = await self.store.load_thread_items(thread.id, None, 40, "desc", context)
            # Bound model input to recent messages, then align to a user turn.
            # Older messages remain visible in history, but are not silently unlimited context.
            items = list(reversed(page.data))
            while items and not isinstance(items[0], UserMessageItem):
                items.pop(0)
            while len(items) > 1 and sum(len(item.model_dump_json()) for item in items) > 60_000:
                items.pop(0)
                while items and not isinstance(items[0], UserMessageItem):
                    items.pop(0)
            agent_input = await simple_to_agent_input(items)
            client = context.client
            tools = []
            vector_store = (client.get("openai_vector_store_id") or "").strip()
            if vector_store:
                tools.append(FileSearchTool(vector_store_ids=[vector_store], max_num_results=5))
            instructions = "\n\n".join([
                context.instructions,
                "Current client: " + client["display_name"],
                "Approved client instructions:\n" + (client.get("assistant_instructions") or "")[:12_000],
                "Only text chat and configured file search are available. You cannot generate images, "
                "access live Hubstaff data, browse websites, or accept uploads in this integration. "
                "Explain unavailable capabilities honestly. Older conversation turns may be outside your context.",
            ])
            if not thread.title and input_user_message:
                title = " ".join(getattr(part, "text", "") for part in input_user_message.content)
                thread.title = " ".join(title.split())[:80] or "New conversation"
            agent = Agent(
                name="AOC client assistant",
                model=os.getenv("OPENAI_MODEL", "gpt-5.4-mini"),
                instructions=instructions,
                tools=tools,
                model_settings=ModelSettings(max_tokens=2500),
            )
            agent_context = AgentContext(thread=thread, store=self.store, request_context=context)
            result = Runner.run_streamed(
                agent, agent_input, context=agent_context, max_turns=5,
                run_config=RunConfig(tracing_disabled=True, trace_include_sensitive_data=False),
            )
            async for event in stream_agent_response(agent_context, result):
                yield event
        except Exception as error:
            logger.error("Assistant response failed: %s", type(error).__name__)
            raise CustomStreamError("The assistant could not finish this reply. Please try again.", allow_retry=True) from None
        finally:
            if result:
                if not result.is_complete:
                    result.cancel()
                usage = result.context_wrapper.usage
                if context.period_start and usage.total_tokens:
                    try:
                        await context.db.execute("""
                            UPDATE portal_ai_usage_monthly
                            SET input_tokens=input_tokens+%s, output_tokens=output_tokens+%s,
                                total_tokens=total_tokens+%s, updated_at=NOW()
                            WHERE client_id=%s AND period_start=%s
                        """, (usage.input_tokens, usage.output_tokens, usage.total_tokens,
                              context.client_id, context.period_start))
                    except Exception as error:
                        logger.error("ChatKit token accounting failed: %s", type(error).__name__)
