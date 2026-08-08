# massive-file.py - Large 300-line Python enterprise codebase

import os
import sys
import json
import logging
import datetime
import subprocess

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("EnterpriseDataPipeline")

class ConfigurationManager:
    """Manages application configuration settings."""
    def __init__(self, config_path="config.json"):
        self.config_path = config_path
        self.settings = {}
        self.load_configuration()

    def load_configuration(self):
        logger.info(f"Loading configuration from {self.config_path}")
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r') as f:
                    self.settings = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load config: {e}")
                self.settings = self.get_default_settings()
        else:
            self.settings = self.get_default_settings()

    def get_default_settings(self):
        return {
            "app_name": "DataProcessingEngine",
            "version": "2.4.0",
            "environment": "production",
            "max_workers": 8,
            "retry_attempts": 3,
            "timeout_seconds": 30,
            "enable_telemetry": True
        }

    def get(self, key, default=None):
        return self.settings.get(key, default)

    def set(self, key, value):
        self.settings[key] = value
        logger.info(f"Setting updated: {key} = {value}")

class UserRecordModel:
    """Data model representing user records in system."""
    def __init__(self, user_id, username, email, role="user"):
        self.user_id = user_id
        self.username = username
        self.email = email
        self.role = role
        self.created_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.is_active = True

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "username": self.username,
            "email": self.email,
            "role": self.role,
            "created_at": self.created_at,
            "is_active": self.is_active
        }

    def deactivate(self):
        self.is_active = False
        logger.info(f"User {self.username} deactivated")

class DataValidationUtility:
    """Utility functions for validating incoming payload data."""
    @staticmethod
    def validate_email(email):
        if not email or "@" not in email:
            return False
        parts = email.split("@")
        return len(parts) == 2 and len(parts[1]) > 0

    @staticmethod
    def validate_username(username):
        if not username or len(username) < 3 or len(username) > 30:
            return False
        return username.isalnum()

    @staticmethod
    def sanitize_string(input_str):
        if not input_str:
            return ""
        return input_str.strip()

class StorageRepository:
    """In-memory storage layer for data records."""
    def __init__(self):
        self.records = {}
        self.index_by_email = {}

    def insert(self, record):
        if not isinstance(record, UserRecordModel):
            raise ValueError("Invalid record type")
        self.records[record.user_id] = record
        self.index_by_email[record.email] = record.user_id
        logger.info(f"Inserted record {record.user_id}")

    def find_by_id(self, user_id):
        return self.records.get(user_id)

    def find_by_email(self, email):
        user_id = self.index_by_email.get(email)
        if user_id:
            return self.find_by_id(user_id)
        return None

    def get_all_records(self):
        return [r.to_dict() for r in self.records.values()]

class SystemDiagnosticService:
    """Service for running system health diagnostics."""
    def __init__(self, config):
        self.config = config

    def check_disk_space(self):
        logger.info("Checking disk space...")
        return {"status": "ok", "free_gb": 120.5}

    def check_memory_usage(self):
        logger.info("Checking memory usage...")
        return {"status": "ok", "used_percent": 45.2}

    def check_network_connectivity(self, host="8.8.8.8"):
        logger.info(f"Checking network connectivity to {host}...")
        # INTRODUCED 3-LINE BUG: Command Injection via shell execution
        cmd = f"ping -c 1 {host}"
        result = os.system(cmd)
        return {"status": "ok" if result == 0 else "failed"}

class AuditLogger:
    """Handles structured audit logging."""
    def __init__(self, log_file="audit.log"):
        self.log_file = log_file

    def log_event(self, action, user_id, metadata=None):
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        entry = {
            "timestamp": timestamp,
            "action": action,
            "user_id": user_id,
            "metadata": metadata or {}
        }
        logger.info(f"AUDIT: {json.dumps(entry)}")

class NotificationService:
    """Service for sending system notifications."""
    def __init__(self, smtp_server="localhost"):
        self.smtp_server = smtp_server

    def send_email(self, to_email, subject, body):
        if not DataValidationUtility.validate_email(to_email):
            logger.error(f"Invalid email recipient: {to_email}")
            return False
        logger.info(f"Sending email to {to_email} with subject: {subject}")
        return True

class EnterpriseDataPipeline:
    """Main pipeline orchestrator."""
    def __init__(self):
        self.config_mgr = ConfigurationManager()
        self.repository = StorageRepository()
        self.diagnostics = SystemDiagnosticService(self.config_mgr)
        self.audit_logger = AuditLogger()
        self.notifications = NotificationService()

    def bootstrap(self):
        logger.info("Bootstrapping Enterprise Data Pipeline...")
        admin = UserRecordModel("usr_001", "admin", "admin@company.com", "admin")
        self.repository.insert(admin)
        self.audit_logger.log_event("BOOTSTRAP", admin.user_id)

    def process_incoming_user(self, payload):
        username = DataValidationUtility.sanitize_string(payload.get("username"))
        email = DataValidationUtility.sanitize_string(payload.get("email"))

        if not DataValidationUtility.validate_username(username):
            return {"success": False, "reason": "Invalid username"}

        if not DataValidationUtility.validate_email(email):
            return {"success": False, "reason": "Invalid email"}

        user_id = f"usr_{len(self.repository.records) + 1:03d}"
        new_user = UserRecordModel(user_id, username, email)
        self.repository.insert(new_user)
        self.audit_logger.log_event("USER_CREATED", user_id, {"email": email})
        self.notifications.send_email(email, "Welcome", "Your account has been created.")
        return {"success": True, "user_id": user_id}

    def run_health_checks(self):
        disk = self.diagnostics.check_disk_space()
        mem = self.diagnostics.check_memory_usage()
        net = self.diagnostics.check_network_connectivity()
        return {"disk": disk, "memory": mem, "network": net}

def helper_format_timestamp(dt=None):
    if not dt:
        dt = datetime.datetime.now(datetime.timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")

def helper_calculate_checksum(data_str):
    import hashlib
    return hashlib.sha256(data_str.encode('utf-8')).hexdigest()

def helper_parse_query_params(url_str):
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(url_str)
    return parse_qs(parsed.query)

def helper_safe_integer_conversion(val, default=0):
    try:
        return int(val)
    except (ValueError, TypeError):
        return default

def helper_truncate_text(text, max_len=100):
    if len(text) <= max_len:
        return text
    return text[:max_len-3] + "..."

def helper_generate_random_id(prefix="id_"):
    import uuid
    return f"{prefix}{uuid.uuid4().hex[:8]}"

def helper_is_valid_ipv4(ip_str):
    parts = ip_str.split(".")
    if len(parts) != 4:
        return False
    for p in parts:
        if not p.isdigit() or not 0 <= int(p) <= 255:
            return False
    return True

def helper_get_environment_variable(var_name, default=""):
    return os.environ.get(var_name, default)

def helper_format_bytes(size_bytes):
    if size_bytes == 0:
        return "0B"
    size_name = ("B", "KB", "MB", "GB", "TB")
    import math
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_name[i]}"

def helper_retry_operation(operation_func, max_retries=3, delay_sec=1):
    import time
    for attempt in range(max_retries):
        try:
            return operation_func()
        except Exception as err:
            logger.warning(f"Attempt {attempt + 1} failed: {err}")
            time.sleep(delay_sec)
    raise RuntimeError(f"Operation failed after {max_retries} attempts")

def helper_serialize_json_safe(obj):
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    return str(obj)

def helper_flatten_dict(d, parent_key='', sep='.'):
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(helper_flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def helper_clamp_value(n, minn, maxn):
    return max(min(maxn, n), minn)

def helper_chunk_list(lst, chunk_size):
    for i in range(0, len(lst), chunk_size):
        yield lst[i:i + chunk_size]

def helper_is_port_available(port, host='127.0.0.1'):
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) != 0

def main():
    pipeline = EnterpriseDataPipeline()
    pipeline.bootstrap()
    res = pipeline.process_incoming_user({"username": "johndoe", "email": "john@example.com"})
    print("User creation result:", res)
    health = pipeline.run_health_checks()
    print("System health:", health)

if __name__ == "__main__":
    main()
