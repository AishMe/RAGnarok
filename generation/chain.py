from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable

from generation.llm import get_llm


def get_qa_chain() -> Runnable:
    """
    The simplest possible chain:
        prompt | llm | parser

    This is LCEL (LangChain Expression Language).
    The | pipe operator connects runnables — output of left feeds into right.
    """

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "You are a helpful assistant. Answer clearly and concisely."),
            ("human", "{question}"),
        ]
    )

    llm = get_llm()

    parser = StrOutputParser()

    # Chain — wire them together with the pipe operator
    # flow: prompt.invoke() → llm.invoke() → parser.invoke()
    chain = prompt | llm | parser

    return chain
