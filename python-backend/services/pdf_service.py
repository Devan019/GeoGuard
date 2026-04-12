import os
import logging
import traceback
import asyncio

from services.s3_service import download_pdf
from services.db_service import (
    is_file_processed,
    mark_file_processed,
    insert_rules
)
from utils.pdf_process import process_local_pdf 
from services.connection_manager import manager


logger = logging.getLogger("uvicorn.error")
async def process_pdf_pipeline(file_key: str):
    logger.info(f"🚀 Starting pipeline | file_key={file_key}")
    
    try:
        await manager.broadcast_json({
            "event": "RULES_EXTRACTION_STARTED",
            "data": "Rules are currently getting generated. Please wait..."
        })

        # Step 1: Check if already processed
        logger.info("🔍 Checking if file already processed...")
        if is_file_processed(file_key):
            logger.warning(f"⚠️ File already processed | file_key={file_key}")
            return

        # Step 2: Download PDF
        logger.info("⬇️ Downloading PDF from S3...")
        pdf_path = download_pdf(file_key)

        if not pdf_path:
            logger.error(f"❌ download_pdf returned None | file_key={file_key}")
            return

        logger.info(f"📄 PDF downloaded | path={pdf_path}")

        # Step 3: Process PDF
        logger.info("⚙️ Processing PDF...")
        try:
            # Assuming this is synchronous. If it's a heavy CPU task, 
            # consider running it in a threadpool: asyncio.to_thread(process_local_pdf, pdf_path)
            rules = process_local_pdf(pdf_path)
        except Exception:
            logger.exception("❌ Error during PDF processing")
            return

        # Step 4: Validate rules
        if not rules:
            logger.warning(f"⚠️ No rules extracted | file_key={file_key}")
            return

        logger.info(f"📊 Rules extracted | count={len(rules)}")

        # Step 5: Insert rules into DB
        logger.info("💾 Inserting rules into database...")
        try:
            insert_rules(file_key, rules)
        except Exception:
            logger.exception("❌ Failed to insert rules into DB")
            return

        logger.info("✅ Rules inserted successfully")

        # Step 6: Mark file as processed
        logger.info("🏷️ Marking file as processed...")
        try:
            mark_file_processed(file_key)
        except Exception:
            logger.exception("❌ Failed to mark file as processed")
            return

        logger.info("✅ File marked as processed")
        await manager.broadcast_json({
            "event": "RULES_EXTRACTION_SUCCESS",
            "data": "Rules are generated successfully!"
        })

        # Step 7: Cleanup
        logger.info("🧹 Cleaning up local file...")
        try:
            os.remove(pdf_path)
        except Exception:
            logger.exception(f"❌ Failed to delete file | path={pdf_path}")

        logger.info(f"🎉 Pipeline completed successfully | file_key={file_key}")

    except Exception:
        logger.exception(f"🔥 Pipeline crashed unexpectedly | file_key={file_key}")
        await manager.broadcast_json({
            "event": "RULES_EXTRACTION_ERROR",
            "data": "An error occurred while generating rules."
        })